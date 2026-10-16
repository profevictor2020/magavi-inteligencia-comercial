"""Explicit, bounded Places searches with a durable submission ledger."""

import os
from uuid import UUID
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.tenancy.models import Tenant

from .chile import normalized_location, suggested_localities
from .google_places import GoogleMapsPlacesProvider, PlacesProviderError
from .models import DiscoveryJob, Territory
from .places_ingestion import ingest_places_results, prepare_places_job


ESTIMATED_USD_PER_ATTEMPT = Decimal("0.004")
CACHE_AGE = timedelta(hours=24)


def daily_limit():
    """Operator cap; at most five paid attempts per tenant and Chilean day by default."""
    try:
        configured = int(os.getenv("MAPS_DAILY_MAX_RUNS", "5"))
    except ValueError:
        return 5
    return max(0, min(configured, 50))


def searches_today(tenant):
    return DiscoveryJob.objects.filter(tenant=tenant, submitted_at__date=timezone.localdate()).count()


def serialize_job(job):
    return {
        "id": str(job.id), "status": job.status, "keywords": job.keywords,
        "location": job.location, "category_families": job.category_families,
        "territory_id": str(job.territory_id), "results_count": job.results_count,
        "estimated_cost_usd": str(job.estimated_cost_usd) if job.estimated_cost_usd is not None else None,
        "actual_cost_usd": str(job.actual_cost_usd) if job.actual_cost_usd is not None else None,
        "submission_uncertain": job.submission_uncertain, "error": job.error,
        "submitted_at": job.submitted_at, "finished_at": job.finished_at,
        "observations": [{"decision": row.decision, "business_name": row.business_name,
                          "reason": row.reason, "prospect_id": str(row.prospect_id) if row.prospect_id else None}
                         for row in job.observations.all()],
    }


def start_places_search(tenant, territory_id, *, keywords, locality, category_families=None):
    """Submit at most one POST. Uncertain submissions block future paid searches."""
    if not os.getenv("MINDCASE_API_KEY"):
        raise PlacesProviderError("Falta MINDCASE_API_KEY para consultar Maps.")
    if category_families is not None and (not isinstance(category_families, list) or len(category_families) != 1 or not isinstance(category_families[0], str)):
        raise PlacesProviderError("Selecciona un rubro comercial válido.")
    if not isinstance(keywords, str) or len(keywords.strip()) > 180:
        raise PlacesProviderError("El rubro de búsqueda no es válido.")
    try:
        territory_id = UUID(str(territory_id))
    except (TypeError, ValueError, AttributeError) as error:
        raise PlacesProviderError("Selecciona un territorio válido.") from error
    # Validate the complete request before the paid POST. The tenant lock serializes
    # concurrent attempts even when the provider takes longer than one HTTP request.
    with transaction.atomic():
        Tenant.objects.select_for_update().get(pk=tenant.pk)
        if DiscoveryJob.objects.filter(tenant=tenant, submission_uncertain=True).exists():
            raise PlacesProviderError("Hay una consulta sin resultado confirmado. Revisa Mindcase Run History antes de continuar.")
        if DiscoveryJob.objects.filter(tenant=tenant, status__in=[DiscoveryJob.Status.RUNNING, DiscoveryJob.Status.PENDING]).exists():
            raise PlacesProviderError("Ya hay una búsqueda Maps en curso para esta empresa.")
        territory = Territory.objects.filter(tenant=tenant, pk=territory_id, is_active=True).first()
        if territory is None or not territory.region:
            raise PlacesProviderError("Selecciona un territorio activo de esta empresa con región.")
        allowed = territory.localities or suggested_localities(territory.region)
        if not isinstance(locality, str) or normalized_location(locality) not in {normalized_location(city) for city in allowed}:
            raise PlacesProviderError("La localidad no pertenece al territorio seleccionado.")
        recent = DiscoveryJob.objects.filter(
            tenant=tenant, territory_id=territory_id, status=DiscoveryJob.Status.COMPLETED,
            created_at__gte=timezone.now() - CACHE_AGE,
        ).order_by("-created_at")
        for existing in recent:
            if (normalized_location(existing.keywords) == normalized_location(str(keywords))
                    and normalized_location(existing.location.split(",", 1)[0]) == normalized_location(str(locality))
                    and (category_families is None or set(existing.category_families) == set(category_families))):
                return existing, True
        if searches_today(tenant) >= daily_limit():
            raise PlacesProviderError("Se alcanzó el límite diario de búsquedas Maps de esta empresa.")
        job = prepare_places_job(tenant, territory_id, keywords=keywords, locality=locality,
                                 category_families=category_families)
        # Mark the attempt before network I/O. A process crash cannot silently
        # submit an identical paid request on the next click.
        job.status = DiscoveryJob.Status.RUNNING
        job.submitted_at = timezone.now()
        job.estimated_cost_usd = ESTIMATED_USD_PER_ATTEMPT
        job.save(update_fields=["status", "submitted_at", "estimated_cost_usd"])
    try:
        rows = GoogleMapsPlacesProvider().run_sync(keywords=job.keywords, location=job.location)
        ingest_places_results(tenant, job.id, rows)
    except PlacesProviderError as error:
        job.status = DiscoveryJob.Status.FAILED
        job.submission_uncertain = error.submission_uncertain
        job.error = str(error)[:250]
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "submission_uncertain", "error", "finished_at"])
    except Exception:
        # A crash after submission may still have incurred a charge. Do not log
        # provider payloads or credentials, and never retry automatically.
        job.status = DiscoveryJob.Status.FAILED
        job.submission_uncertain = True
        job.error = "No se pudo confirmar el resultado; revisa Mindcase Run History."
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "submission_uncertain", "error", "finished_at"])
    job.refresh_from_db()
    return job, False
