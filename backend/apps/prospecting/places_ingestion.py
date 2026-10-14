"""Persist previously obtained Google Maps Places rows without making API calls."""

import re
from urllib.parse import urlsplit

from django.db import transaction
from django.utils import timezone

from apps.tenancy.models import Tenant

from .chile import normalized_location, suggested_localities
from .google_places import PlacesProviderError, normalize_place
from .models import DiscoveryJob, DiscoveryObservation, GooglePlaceRecord, Prospect, SocialIdentity, Territory
from .place_categories import category_rejection, resolve_category_families
from .territory_matching import matching_territory


def prepare_places_job(tenant, territory_id, *, keywords, locality, category_families=None):
    """Create a bounded, tenant-owned ledger entry; never submits a paid request."""
    territory = Territory.objects.filter(tenant=tenant, is_active=True).filter(pk=territory_id).first()
    if territory is None or not territory.region:
        raise PlacesProviderError("Selecciona un territorio activo de esta empresa con región.")
    allowed = territory.localities or suggested_localities(territory.region)
    if not locality or normalized_location(locality) not in {normalized_location(city) for city in allowed}:
        raise PlacesProviderError("La localidad no pertenece al territorio seleccionado.")
    if not isinstance(keywords, str) or not keywords.strip():
        raise PlacesProviderError("Indica el rubro de negocios que quieres buscar.")
    families = resolve_category_families(keywords, [] if category_families is None else category_families)
    if not families:
        raise PlacesProviderError("Configura al menos un rubro comercial para esta búsqueda.")
    return DiscoveryJob.objects.create(
        tenant=tenant, territory=territory, keywords=keywords.strip(),
        location=f"{locality.strip()}, {territory.region}, Chile",
        category_families=list(families), max_results=1, max_images=0,
    )


@transaction.atomic
def record_social_candidate(tenant, prospect_id, *, handle, evidence_url):
    """Record an unverified Instagram candidate only under its own company."""
    prospect = Prospect.objects.filter(tenant=tenant, pk=prospect_id).first()
    if prospect is None:
        raise PlacesProviderError("El prospecto no pertenece a esta empresa.")
    normalized_handle = str(handle or "").strip().lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9._]{1,30}", normalized_handle):
        raise PlacesProviderError("La cuenta de Instagram no es válida.")
    try:
        evidence = urlsplit(evidence_url)
    except (TypeError, ValueError) as error:
        raise PlacesProviderError("La URL de evidencia no es válida.") from error
    if evidence.scheme != "https" or not evidence.hostname or len(evidence_url) > 500:
        raise PlacesProviderError("La evidencia debe ser una URL HTTPS.")
    existing = SocialIdentity.objects.select_for_update().filter(
        tenant=tenant, platform="instagram", handle=normalized_handle,
    ).first()
    if existing:
        if existing.prospect_id != prospect.id:
            raise PlacesProviderError("La cuenta ya está asociada a otro prospecto de esta empresa.")
        return existing
    return SocialIdentity.objects.create(
        tenant=tenant, prospect=prospect, platform="instagram", handle=normalized_handle,
        profile_url=f"https://www.instagram.com/{normalized_handle}/",
        verification=SocialIdentity.Verification.CANDIDATE,
        evidence_url=evidence_url, evidence_source="enlace declarado pendiente de verificar",
    )


def _rejection(place, job, territory):
    if not place.place_id:
        return "Mindcase no entregó placeId."
    if not place.name:
        return "Mindcase no entregó el nombre comercial."
    if place.permanently_closed is True or place.temporarily_closed is True:
        return "El establecimiento figura cerrado."
    if normalized_location(place.country) not in {"cl", "chile"}:
        return "El país del establecimiento no está confirmado como Chile."
    if not place.city or not place.region:
        return "Falta ciudad o región verificable."
    if normalized_location(place.region) != normalized_location(territory.region):
        return "La región está fuera del territorio solicitado."
    target_city = job.location.split(",", 1)[0].strip()
    allowed = territory.localities or suggested_localities(territory.region)
    if (normalized_location(place.city) != normalized_location(target_city)
            or normalized_location(place.city) not in {normalized_location(city) for city in allowed}):
        return "La ciudad está fuera de la localidad solicitada."
    if not place.category:
        return "Mindcase no entregó una categoría comercial."
    return category_rejection(place, job.keywords, job.category_families)


@transaction.atomic
def ingest_places_results(tenant, job_id, rows):
    """Idempotently import an already available export for one tenant-bound job."""
    if not isinstance(rows, list):
        raise PlacesProviderError("La exportación de Places debe ser un array JSON.")
    job = DiscoveryJob.objects.select_for_update().select_related("territory").filter(tenant=tenant, pk=job_id).first()
    if job is None:
        raise PlacesProviderError("El job no pertenece a esta empresa.")
    if job.status == DiscoveryJob.Status.COMPLETED:
        return {"created": job.observations.filter(decision=DiscoveryObservation.Decision.CREATED).count(),
                "existing": job.observations.filter(decision=DiscoveryObservation.Decision.EXISTING).count(),
                "rejected": job.observations.filter(decision=DiscoveryObservation.Decision.REJECTED).count()}
    if job.status in (DiscoveryJob.Status.FAILED, DiscoveryJob.Status.CANCELLED):
        raise PlacesProviderError("No se puede importar un job fallido o cancelado.")
    territory = job.territory
    if territory.tenant_id != job.tenant_id or not territory.is_active:
        raise PlacesProviderError("El territorio de esta búsqueda no está activo en la empresa.")
    if job.max_results != 1 or job.max_images != 0:
        raise PlacesProviderError("La Fase 1 solo admite maxResults=1 y maxImages=0.")
    if len(rows) > job.max_results:
        raise PlacesProviderError("La exportación excede el límite de resultados del job.")

    # Serialize imports across jobs of the same company before checking placeId.
    Tenant.objects.select_for_update().get(pk=job.tenant_id)
    counts = {"created": 0, "existing": 0, "rejected": 0}
    for index, row in enumerate(rows):
        try:
            place = normalize_place(row)
            reason = _rejection(place, job, territory)
        except PlacesProviderError as error:
            place = None
            reason = str(error)
        place_id = place.place_id if place else ""
        name = place.name if place else ""
        if reason:
            DiscoveryObservation.objects.create(
                job=job, result_index=index, place_id=place_id, business_name=name,
                decision=DiscoveryObservation.Decision.REJECTED, reason=reason,
            )
            counts["rejected"] += 1
            continue
        record = GooglePlaceRecord.objects.filter(tenant_id=job.tenant_id, place_id=place.place_id).select_related("prospect").first()
        if record:
            if record.prospect.tenant_id != job.tenant_id:
                raise PlacesProviderError("El placeId está asociado a otra empresa.")
            prospect = record.prospect
            record.category = place.category
            record.all_categories = place.all_categories
            record.latitude = place.latitude
            record.longitude = place.longitude
            record.place_url = place.place_url
            record.rating = place.rating
            record.reviews = place.reviews
            record.permanently_closed = place.permanently_closed
            record.temporarily_closed = place.temporarily_closed
            record.save()
            decision = DiscoveryObservation.Decision.EXISTING
            counts["existing"] += 1
        else:
            matched = matching_territory(place.city, place.region, [territory])
            if matched is None:
                raise PlacesProviderError("No se pudo asignar el establecimiento a su territorio.")
            prospect = Prospect.objects.create(
                tenant_id=job.tenant_id, territory=matched, name=place.name,
                address=place.address, city=place.city, region=place.region,
                website=place.website, phone=place.phone, source="Google Maps Places · Mindcase",
                notes=f"Categoría observada en Google Maps: {place.category}"[:2000],
            )
            GooglePlaceRecord.objects.create(
                tenant_id=job.tenant_id, prospect=prospect, place_id=place.place_id,
                category=place.category, all_categories=place.all_categories,
                latitude=place.latitude, longitude=place.longitude, place_url=place.place_url,
                rating=place.rating, reviews=place.reviews,
                permanently_closed=place.permanently_closed, temporarily_closed=place.temporarily_closed,
            )
            decision = DiscoveryObservation.Decision.CREATED
            counts["created"] += 1
        DiscoveryObservation.objects.create(
            job=job, result_index=index, place_id=place.place_id, business_name=place.name,
            prospect=prospect, decision=decision,
            reason="Negocio ya registrado por placeId." if record else "Negocio local con categoría y ubicación verificadas.",
        )
    job.results_count = len(rows)
    job.status = DiscoveryJob.Status.COMPLETED
    job.finished_at = timezone.now()
    job.save(update_fields=["results_count", "status", "finished_at"])
    return counts
