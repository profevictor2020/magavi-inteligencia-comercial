"""Places fixtures mirror the observed Mindcase export, with invented business data."""

import json
from decimal import Decimal
from io import BytesIO
from urllib.error import HTTPError

import pytest
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.prospecting.google_places import GoogleMapsPlacesProvider, PlacesProviderError, normalize_place
from apps.prospecting.models import (
    DiscoveryJob, DiscoveryObservation, GooglePlaceRecord, Prospect, SocialIdentity, Territory,
)
from apps.prospecting.places_ingestion import ingest_places_results, prepare_places_job, record_social_candidate
from apps.prospecting.places_search import start_places_search
from apps.tenancy.models import Membership, Tenant, TenantDomain


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
    assert result[0]["placeId"] == "synthetic-place-1"
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
    assert error.value.submission_uncertain is True


def test_timeout_marks_submission_uncertain_and_never_retries(monkeypatch):
    monkeypatch.setenv("MINDCASE_API_KEY", "mock-secret-not-real")
    attempts = []

    def fake_open(request, timeout):
        attempts.append(request.full_url)
        raise TimeoutError("timed out after submission")

    monkeypatch.setattr("apps.prospecting.google_places.urlopen", fake_open)
    with pytest.raises(PlacesProviderError, match="Run History") as error:
        GoogleMapsPlacesProvider().run_sync(keywords="cafeterías", location="Puerto Montt")
    assert error.value.submission_uncertain is True
    assert len(attempts) == 1
    assert "mock-secret-not-real" not in str(error.value)


def test_invalid_200_response_is_uncertain_and_not_retried(monkeypatch):
    monkeypatch.setenv("MINDCASE_API_KEY", "mock-secret-not-real")
    attempts = []

    def fake_open(request, timeout):
        attempts.append(request.full_url)
        return BytesIO(b'{"data": []}')

    monkeypatch.setattr("apps.prospecting.google_places.urlopen", fake_open)
    with pytest.raises(PlacesProviderError, match="Run History") as error:
        GoogleMapsPlacesProvider().run_sync(keywords="cafeterías", location="Puerto Montt")
    assert error.value.submission_uncertain is True
    assert len(attempts) == 1


@pytest.mark.django_db
def test_prepared_job_has_explicit_rubro_and_strict_one_result_limit(places_setup):
    tenant, other, territory, _ = places_setup
    job = prepare_places_job(tenant, territory.id, keywords="cafeterías", locality="Puerto Montt")
    assert job.category_families == ["cafe"]
    assert job.max_results == 1 and job.max_images == 0
    assert job.status == DiscoveryJob.Status.PREPARED
    assert job.external_job_id == ""
    assert job.location == "Puerto Montt, Los Lagos, Chile"
    with pytest.raises(PlacesProviderError, match="territorio"):
        prepare_places_job(other, territory.id, keywords="cafeterías", locality="Puerto Montt")
    with pytest.raises(PlacesProviderError, match="rubro comercial"):
        prepare_places_job(tenant, territory.id, keywords="negocios variados", locality="Puerto Montt")
    with pytest.raises(PlacesProviderError, match="localidad"):
        prepare_places_job(tenant, territory.id, keywords="cafeterías", locality="Santiago")


@pytest.mark.django_db
def test_category_mapping_accepts_synonyms_and_explicit_family(places_setup, place_row):
    tenant, _, territory, first = places_setup
    # The observed provider category is Espresso bar; the buyer query says cafeterías.
    assert ingest_places_results(tenant, first.id, [place_row])["created"] == 1
    bakery = prepare_places_job(tenant, territory.id, keywords="proveedores locales", locality="Puerto Montt",
                                category_families=["bakery"])
    assert ingest_places_results(tenant, bakery.id, [{**place_row, "placeId": "bakery-2",
                                                     "category": "Bakery", "allCategories": ["Bakery"]}])["created"] == 1
    assert bakery.category_families == ["bakery"]


@pytest.mark.django_db
def test_unrelated_category_is_rejected_with_commercial_reason(places_setup, place_row):
    tenant, _, _, job = places_setup
    assert ingest_places_results(tenant, job.id, [{**place_row, "category": "Beauty salon",
                                                  "allCategories": ["Beauty salon"]}])["rejected"] == 1
    assert "no corresponde al rubro" in DiscoveryObservation.objects.get(job=job).reason
    assert not Prospect.objects.filter(tenant=tenant).exists()


@pytest.mark.django_db
def test_no_unknown_rubro_is_silently_accepted(places_setup, place_row):
    tenant, _, territory, _ = places_setup
    job = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="negocios variados",
                                      location="Puerto Montt, Los Lagos, Chile", max_results=1)
    assert ingest_places_results(tenant, job.id, [place_row])["rejected"] == 1
    assert "No hay una regla comercial" in DiscoveryObservation.objects.get(job=job).reason


@pytest.mark.django_db
def test_ingestion_rejects_job_of_another_company_and_unsafe_limits(places_setup, place_row):
    tenant, other, _, job = places_setup
    with pytest.raises(PlacesProviderError, match="no pertenece"):
        ingest_places_results(other, job.id, [place_row])
    job.max_results = 2
    job.save(update_fields=["max_results"])
    with pytest.raises(PlacesProviderError, match="maxResults=1"):
        ingest_places_results(tenant, job.id, [place_row])
    assert not DiscoveryObservation.objects.filter(job=job).exists()


@pytest.mark.django_db
def test_ingestion_rejects_corrupt_cross_tenant_place_link(places_setup, place_row):
    tenant, other, _, job = places_setup
    foreign = Prospect.objects.create(tenant=other, name="Ajeno", source="manual")
    GooglePlaceRecord.objects.create(tenant=tenant, prospect=foreign, place_id=place_row["placeId"])
    with pytest.raises(PlacesProviderError, match="otra empresa"):
        ingest_places_results(tenant, job.id, [place_row])
    assert not DiscoveryObservation.objects.filter(job=job).exists()


@pytest.mark.django_db
def test_ingestion_rejects_corrupt_cross_tenant_job_territory(places_setup, place_row):
    tenant, other, territory, _ = places_setup
    corrupt = DiscoveryJob.objects.create(tenant=other, territory=territory, keywords="cafeterías",
                                          location="Puerto Montt, Los Lagos, Chile", max_results=1)
    with pytest.raises(PlacesProviderError, match="no está activo en la empresa"):
        ingest_places_results(other, corrupt.id, [place_row])
    assert not DiscoveryObservation.objects.filter(job=corrupt).exists()
    assert not Prospect.objects.filter(tenant=other).exists()


@pytest.mark.django_db
def test_social_candidate_service_enforces_tenant_and_never_verifies_automatically(places_setup):
    tenant, other, _, _ = places_setup
    prospect = Prospect.objects.create(tenant=tenant, name="Local", source="manual")
    with pytest.raises(PlacesProviderError, match="no pertenece"):
        record_social_candidate(other, prospect.id, handle="local", evidence_url="https://local.example/")
    identity = record_social_candidate(tenant, prospect.id, handle="@LOCAL", evidence_url="https://local.example/")
    assert identity.verification == SocialIdentity.Verification.CANDIDATE
    assert identity.handle == "local"
    assert record_social_candidate(tenant, prospect.id, handle="local", evidence_url="https://local.example/").id == identity.id
    second = Prospect.objects.create(tenant=tenant, name="Otro local", source="manual")
    with pytest.raises(PlacesProviderError, match="otro prospecto"):
        record_social_candidate(tenant, second.id, handle="local", evidence_url="https://local.example/")
    assert SocialIdentity.objects.count() == 1
    foreign = Prospect.objects.create(tenant=other, name="Empresa ajena", source="manual")
    foreign_identity = record_social_candidate(other, foreign.id, handle="local", evidence_url="https://foreign.example/")
    assert foreign_identity.tenant == other
    assert SocialIdentity.objects.filter(tenant=tenant).count() == 1


@pytest.mark.django_db
def test_ingestion_creates_local_business_without_instagram_and_is_idempotent(places_setup, place_row):
    tenant, _, territory, job = places_setup
    assert ingest_places_results(tenant, job.id, [place_row]) == {"created": 1, "existing": 0, "rejected": 0}
    prospect = Prospect.objects.get(tenant=tenant)
    assert prospect.instagram_handle == ""
    assert prospect.territory == territory
    assert prospect.website == ""
    assert GooglePlaceRecord.objects.get(prospect=prospect).place_id == place_row["placeId"]
    assert DiscoveryObservation.objects.get(job=job).decision == DiscoveryObservation.Decision.CREATED
    assert ingest_places_results(tenant, job.id, [place_row]) == {"created": 1, "existing": 0, "rejected": 0}
    assert Prospect.objects.filter(tenant=tenant).count() == 1
    assert DiscoveryObservation.objects.filter(job=job).count() == 1


@pytest.mark.django_db
def test_same_place_id_reuses_prospect_across_jobs_but_same_name_does_not(places_setup, place_row):
    tenant, _, territory, first = places_setup
    ingest_places_results(tenant, first.id, [place_row])
    second = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="café",
                                         location=first.location, max_results=1)
    assert ingest_places_results(tenant, second.id, [place_row])["existing"] == 1
    third = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="espresso",
                                        location=first.location, max_results=1)
    assert ingest_places_results(tenant, third.id, [{**place_row, "placeId": "synthetic-place-2"}])["created"] == 1
    assert Prospect.objects.filter(tenant=tenant).count() == 2


@pytest.mark.django_db
def test_same_place_id_is_independent_across_companies(places_setup, place_row):
    tenant, other, _, first = places_setup
    ingest_places_results(tenant, first.id, [place_row])
    other_territory = Territory.objects.create(tenant=other, name="Los Lagos", region="Los Lagos",
                                               localities=["Puerto Montt"])
    other_job = DiscoveryJob.objects.create(tenant=other, territory=other_territory, keywords="cafeterías",
                                            location=first.location, max_results=1)
    assert ingest_places_results(other, other_job.id, [place_row])["created"] == 1
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
    assert ingest_places_results(tenant, job.id, [{**place_row, **changes}])["rejected"] == 1
    assert Prospect.objects.filter(tenant=tenant).count() == 0
    observation = DiscoveryObservation.objects.get(job=job)
    assert observation.decision == DiscoveryObservation.Decision.REJECTED
    assert reason in observation.reason


@pytest.mark.django_db
def test_tenant_isolation_and_social_identity_validation(places_setup, place_row):
    tenant, other, territory, job = places_setup
    ingest_places_results(tenant, job.id, [place_row])
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
        ingest_places_results(tenant, job.id, [place_row, {**place_row, "placeId": "synthetic-place-2"}])
    assert not Prospect.objects.filter(tenant=tenant).exists()
    assert not DiscoveryObservation.objects.filter(job=job).exists()


@pytest.mark.django_db
def test_malformed_row_is_recorded_and_empty_export_completes(places_setup):
    tenant, _, territory, job = places_setup
    assert ingest_places_results(tenant, job.id, [None])["rejected"] == 1
    assert DiscoveryObservation.objects.get(job=job).reason == "El resultado de Places no es un objeto."
    assert not Prospect.objects.filter(tenant=tenant).exists()
    empty_job = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="sin resultados",
                                            location=job.location, max_results=1)
    assert ingest_places_results(tenant, empty_job.id, []) == {"created": 0, "existing": 0, "rejected": 0}
    empty_job.refresh_from_db()
    assert empty_job.status == DiscoveryJob.Status.COMPLETED


@pytest.mark.django_db
def test_manual_search_imports_once_and_reuses_recent_result(monkeypatch, places_setup, place_row):
    tenant, _, territory, _ = places_setup
    monkeypatch.setenv("MINDCASE_API_KEY", "fake-key")
    calls = []

    def fake_run(self, **kwargs):
        calls.append(kwargs)
        return [place_row]

    monkeypatch.setattr(GoogleMapsPlacesProvider, "run_sync", fake_run)
    job, cached = start_places_search(tenant, territory.id, keywords="cafeterías", locality="Puerto Montt")
    assert not cached and job.status == DiscoveryJob.Status.COMPLETED
    assert job.results_count == 1 and job.estimated_cost_usd == Decimal("0.004")
    assert job.actual_cost_usd is None
    assert Prospect.objects.filter(tenant=tenant, instagram_handle="").count() == 1
    same, cached = start_places_search(tenant, territory.id, keywords="cafeterías", locality="Puerto Montt")
    assert cached and same.id == job.id and len(calls) == 1


@pytest.mark.django_db
def test_uncertain_submission_blocks_followup_without_second_post(monkeypatch, places_setup):
    tenant, _, territory, _ = places_setup
    monkeypatch.setenv("MINDCASE_API_KEY", "fake-key")
    calls = []

    def fake_run(self, **kwargs):
        calls.append(kwargs)
        raise PlacesProviderError("Sin confirmación", submission_uncertain=True)

    monkeypatch.setattr(GoogleMapsPlacesProvider, "run_sync", fake_run)
    job, _ = start_places_search(tenant, territory.id, keywords="cafeterías", locality="Puerto Montt")
    assert job.status == DiscoveryJob.Status.FAILED and job.submission_uncertain
    with pytest.raises(PlacesProviderError, match="Run History"):
        start_places_search(tenant, territory.id, keywords="panaderías", locality="Puerto Montt")
    assert len(calls) == 1


@pytest.mark.django_db
def test_daily_cap_and_tenant_scope_before_paid_request(monkeypatch, places_setup):
    tenant, other, territory, _ = places_setup
    monkeypatch.setenv("MINDCASE_API_KEY", "fake-key")
    monkeypatch.setenv("MAPS_DAILY_MAX_RUNS", "1")
    existing = DiscoveryJob.objects.create(tenant=tenant, territory=territory, keywords="cafeterías",
                                           location="Puerto Montt, Los Lagos, Chile", max_results=1,
                                           submitted_at=timezone.now(), status=DiscoveryJob.Status.COMPLETED)
    with pytest.raises(PlacesProviderError, match="límite diario"):
        start_places_search(tenant, territory.id, keywords="panaderías", locality="Puerto Montt")
    existing.submitted_at = None
    existing.save(update_fields=["submitted_at"])
    with pytest.raises(PlacesProviderError, match="territorio"):
        start_places_search(other, territory.id, keywords="cafeterías", locality="Puerto Montt")


@pytest.mark.django_db
def test_maps_route_requires_tenant_editor_and_exposes_observation(monkeypatch, places_setup, place_row):
    tenant, _, territory, _ = places_setup
    TenantDomain.objects.create(tenant=tenant, hostname="maps.localhost", is_primary=True, is_verified=True)
    owner = get_user_model().objects.create_user("maps-owner", "maps-owner@example.test", "password")
    viewer = get_user_model().objects.create_user("maps-viewer", "maps-viewer@example.test", "password")
    Membership.objects.create(tenant=tenant, user=owner, role=Membership.Role.OWNER)
    Membership.objects.create(tenant=tenant, user=viewer, role=Membership.Role.VIEWER)
    monkeypatch.setenv("MINDCASE_API_KEY", "fake-key")
    monkeypatch.setattr(GoogleMapsPlacesProvider, "run_sync", lambda self, **kwargs: [place_row])
    url = "/api/prospects/places/"
    body = {"territory": str(territory.id), "locality": "Puerto Montt", "keywords": "cafeterías",
            "category_families": ["cafe"]}
    viewer_client = APIClient()
    viewer_client.force_authenticate(user=viewer)
    assert viewer_client.post(url, body, format="json", HTTP_HOST="maps.localhost").status_code == 403
    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)
    response = owner_client.post(url, body, format="json", HTTP_HOST="maps.localhost")
    assert response.status_code == 200
    assert response.json()["job"]["observations"][0]["decision"] == "CREATED"
    assert viewer_client.get(url, HTTP_HOST="maps.localhost").json()["jobs"][0]["results_count"] == 1
