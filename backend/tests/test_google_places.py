"""Places fixtures mirror the observed Mindcase export, with invented business data."""

import json
from io import BytesIO
from urllib.error import HTTPError

import pytest
from django.core.exceptions import ValidationError

from apps.prospecting.google_places import GoogleMapsPlacesProvider, PlacesProviderError, normalize_place
from apps.prospecting.models import (
    DiscoveryJob, DiscoveryObservation, GooglePlaceRecord, Prospect, SocialIdentity, Territory,
)
from apps.prospecting.places_ingestion import ingest_places_results
from apps.tenancy.models import Tenant


@pytest.fixture
def places_setup(db):
    tenant = Tenant.objects.create(name="Marina", slug="maps-marina", headline="Marina", logo_path="/a.svg")
    other = Tenant.objects.create(name="Otra", slug="maps-otra", headline="Otra", logo_path="/b.svg")
    territory = Territory.objects.create(tenant=tenant, name="Los Lagos", region="Los Lagos",
                                         localities=["Puerto Montt", "Puerto Varas"])
    job = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="cafeterías",
                                      location="Puerto Montt, Los Lagos, Chile", max_results=1)
    return tenant, other, territory, job


@pytest.fixture
def place_row():
    # Relevant field names and types come from run e6c5b870; values are synthetic.
    return {
        "placeId": "synthetic-place-1", "businessName": "Café de prueba", "city": "Puerto Montt",
        "state": "Los Lagos", "country": "CL", "address": "Calle Ficticia 1, Puerto Montt",
        "category": "Espresso bar", "allCategories": ["Espresso bar"],
        "latitude": -41.4700, "longitude": -72.9400, "rating": 4.7, "reviews": 21,
        "phone": "+56 9 0000 0000", "website": None, "emails": None, "socials": None,
        "placeUrl": "https://www.google.com/maps/place/example", "photos": [], "photoCount": 0,
        "permanentlyClosed": False, "temporarilyClosed": False,
    }


def test_payload_is_bounded_and_matches_verified_playground():
    provider = GoogleMapsPlacesProvider()
    assert provider.payload(keywords=" cafeterías ", location="Puerto Montt, Los Lagos, Chile") == {
        "params": {"keywords": "cafeterías", "location": "Puerto Montt, Los Lagos, Chile",
                   "maxResults": 1, "minimumRating": "", "websiteFilter": "", "maxImages": 0},
    }
    with pytest.raises(PlacesProviderError):
        provider.payload(keywords="cafeterías", location="Puerto Montt", max_results=2)


def test_real_export_shape_and_nullable_social_fields(place_row):
    place = GoogleMapsPlacesProvider.normalize_results([place_row])[0]
    assert place.country == "CL"
    assert place.category == "Espresso bar"
    assert place.website == ""
    assert place.rating is not None
    with pytest.raises(PlacesProviderError):
        GoogleMapsPlacesProvider.normalize_results({"data": [place_row]})
    assert normalize_place({**place_row, "website": "file:///etc/passwd"}).website == ""


def test_provider_uses_bearer_and_parses_array_without_live_request(monkeypatch, place_row):
    monkeypatch.setenv("MINDCASE_API_KEY", "mock-key-not-real")
    captured = {}

    def fake_open(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["payload"] = json.loads(request.data)
        return BytesIO(json.dumps([place_row]).encode())

    monkeypatch.setattr("apps.prospecting.google_places.urlopen", fake_open)
    result = GoogleMapsPlacesProvider().run_sync(keywords="cafeterías", location="Puerto Montt, Los Lagos, Chile")
    assert result[0].place_id == "synthetic-place-1"
    assert captured["url"].endswith("/v1/data/google-maps/places/run?wait=true")
    assert captured["authorization"] == "Bearer mock-key-not-real"
    assert captured["payload"]["params"]["maxImages"] == 0


def test_provider_http_error_never_exposes_key(monkeypatch):
    monkeypatch.setenv("MINDCASE_API_KEY", "mock-secret-not-real")

    def fake_open(request, timeout):
        raise HTTPError(request.full_url, 429, "too many", {}, BytesIO(b""))

    monkeypatch.setattr("apps.prospecting.google_places.urlopen", fake_open)
    with pytest.raises(PlacesProviderError, match="HTTP 429") as error:
        GoogleMapsPlacesProvider().run_sync(keywords="cafeterías", location="Puerto Montt")
    assert "mock-secret-not-real" not in str(error.value)


@pytest.mark.django_db
def test_ingestion_creates_local_business_without_instagram_and_is_idempotent(places_setup, place_row):
    tenant, _, territory, job = places_setup
    assert ingest_places_results(job.id, [place_row]) == {"created": 1, "existing": 0, "rejected": 0}
    prospect = Prospect.objects.get(tenant=tenant)
    assert prospect.instagram_handle == ""
    assert prospect.territory == territory
    assert prospect.website == ""
    assert GooglePlaceRecord.objects.get(prospect=prospect).place_id == place_row["placeId"]
    assert DiscoveryObservation.objects.get(job=job).decision == DiscoveryObservation.Decision.CREATED
    assert ingest_places_results(job.id, [place_row]) == {"created": 1, "existing": 0, "rejected": 0}
    assert Prospect.objects.filter(tenant=tenant).count() == 1
    assert DiscoveryObservation.objects.filter(job=job).count() == 1


@pytest.mark.django_db
def test_same_place_id_reuses_prospect_across_jobs_but_same_name_does_not(places_setup, place_row):
    tenant, _, territory, first = places_setup
    ingest_places_results(first.id, [place_row])
    second = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="café",
                                         location=first.location, max_results=1)
    assert ingest_places_results(second.id, [place_row])["existing"] == 1
    third = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="espresso",
                                        location=first.location, max_results=1)
    assert ingest_places_results(third.id, [{**place_row, "placeId": "synthetic-place-2"}])["created"] == 1
    assert Prospect.objects.filter(tenant=tenant).count() == 2


@pytest.mark.django_db
def test_same_place_id_is_independent_across_companies(places_setup, place_row):
    tenant, other, _, first = places_setup
    ingest_places_results(first.id, [place_row])
    other_territory = Territory.objects.create(tenant=other, name="Los Lagos", region="Los Lagos",
                                               localities=["Puerto Montt"])
    other_job = DiscoveryJob.objects.create(tenant=other, territory=other_territory, keywords="cafeterías",
                                            location=first.location, max_results=1)
    assert ingest_places_results(other_job.id, [place_row])["created"] == 1
    assert GooglePlaceRecord.objects.filter(place_id=place_row["placeId"]).count() == 2
    assert Prospect.objects.filter(tenant=tenant).count() == 1
    assert Prospect.objects.filter(tenant=other).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("changes,reason", [
    ({"city": "Santiago"}, "ciudad"),
    ({"city": "Puerto Varas"}, "ciudad"),
    ({"state": "Valparaíso"}, "región"),
    ({"country": "US"}, "país"),
    ({"category": None}, "categoría"),
    ({"permanentlyClosed": True}, "cerrado"),
    ({"placeId": None}, "placeId"),
])
def test_invalid_places_are_traced_without_creating_prospects(places_setup, place_row, changes, reason):
    tenant, _, _, job = places_setup
    assert ingest_places_results(job.id, [{**place_row, **changes}])["rejected"] == 1
    assert Prospect.objects.filter(tenant=tenant).count() == 0
    observation = DiscoveryObservation.objects.get(job=job)
    assert observation.decision == DiscoveryObservation.Decision.REJECTED
    assert reason in observation.reason


@pytest.mark.django_db
def test_tenant_isolation_and_social_identity_validation(places_setup, place_row):
    tenant, other, territory, job = places_setup
    ingest_places_results(job.id, [place_row])
    prospect = Prospect.objects.get(tenant=tenant)
    other_territory = Territory.objects.create(tenant=other, name="Los Lagos", region="Los Lagos")
    with pytest.raises(ValidationError):
        DiscoveryJob(tenant=tenant, territory=other_territory, keywords="café", location="Puerto Montt", max_results=1).full_clean()
    with pytest.raises(ValidationError):
        GooglePlaceRecord(tenant=other, prospect=prospect, place_id="foreign").full_clean()
    with pytest.raises(ValidationError):
        SocialIdentity(tenant=other, prospect=prospect, platform="instagram", handle="fake",
                       profile_url="https://www.instagram.com/fake/").full_clean()
    with pytest.raises(ValidationError):
        DiscoveryObservation(job=job, result_index=2, prospect=Prospect.objects.create(
            tenant=other, name="Otro", source="manual"), decision="EXISTING", reason="test").full_clean()
    assert GooglePlaceRecord.objects.filter(tenant=other).count() == 0


@pytest.mark.django_db
def test_oversized_export_rolls_back_without_paid_calls(places_setup, place_row):
    tenant, _, _, job = places_setup
    with pytest.raises(PlacesProviderError, match="excede"):
        ingest_places_results(job.id, [place_row, {**place_row, "placeId": "synthetic-place-2"}])
    assert not Prospect.objects.filter(tenant=tenant).exists()
    assert not DiscoveryObservation.objects.filter(job=job).exists()


@pytest.mark.django_db
def test_malformed_row_is_recorded_and_empty_export_completes(places_setup):
    tenant, _, territory, job = places_setup
    assert ingest_places_results(job.id, [None])["rejected"] == 1
    assert DiscoveryObservation.objects.get(job=job).reason == "El resultado de Places no es un objeto."
    assert not Prospect.objects.filter(tenant=tenant).exists()
    empty_job = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="sin resultados",
                                            location=job.location, max_results=1)
    assert ingest_places_results(empty_job.id, []) == {"created": 0, "existing": 0, "rejected": 0}
    empty_job.refresh_from_db()
    assert empty_job.status == DiscoveryJob.Status.COMPLETED
