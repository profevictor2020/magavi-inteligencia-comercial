import json
import importlib
from datetime import timedelta
from io import BytesIO
from urllib.error import HTTPError, URLError

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Category, IndustrySegment, Product
from apps.prospecting import discovery
from apps.prospecting.models import DiscoveryEvaluation, DiscoveryRun, Opportunity, Prospect, Territory
from apps.prospecting.serializers import normalized_domain
from apps.tenancy.models import Membership, Tenant, TenantDomain


@pytest.fixture
def discovery_company(db):
    tenant = Tenant.objects.create(name="Empresa Marina", slug="marina", headline="Marina", logo_path="/a.svg")
    TenantDomain.objects.create(tenant=tenant, hostname="marina.localhost", is_primary=True, is_verified=True)
    user = get_user_model().objects.create_user("marina-owner", "marina@example.test", "password")
    Membership.objects.create(tenant=tenant, user=user, role=Membership.Role.OWNER)
    category = Category.objects.create(tenant=tenant, name="Mariscos")
    Product.objects.create(tenant=tenant, category=category, name="Camarón", sku="CAM-1", target_industries=[IndustrySegment.FOOD_SERVICE])
    Territory.objects.create(tenant=tenant, name="Santiago", localities=["Santiago"])
    return tenant, user


@pytest.mark.django_db
def test_discovery_creates_only_relevant_profiles_and_deduplicates(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    monkeypatch.delenv("MINDCASE_API_KEY", raising=False)
    monkeypatch.setenv("APIFY_TOKEN", "test-apify-token")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-token")
    calls = []

    def fake_ai(system, data):
        if "hashtags" in system:
            return {"hashtags": ["sushisantiago", "restaurantesantiago", "sushisantiago"]}
        return {"prospects": [
            {"username": "sushi_real", "relevant": True, "score": 84, "industry": "FOOD_SERVICE", "reason": "Publica platos de camarón para venta.", "city": "Santiago"},
            {"username": "usuario_personal", "relevant": False, "score": 15, "industry": "", "reason": "", "city": ""},
            {"username": "perfil_inventado", "relevant": True, "score": 99, "industry": "FOOD_SERVICE", "reason": "Inventado", "city": ""},
        ]}

    def fake_post(url, payload, bearer, timeout=45):
        calls.append((url, payload["search"], bearer))
        return [
            {"ownerUsername": "sushi_real", "ownerFullName": "Sushi Real", "caption": "Sushi y camarones en Santiago"},
            {"ownerUsername": "usuario_personal", "ownerFullName": "Persona", "caption": "Almuerzo en casa"},
        ]

    monkeypatch.setattr(discovery, "_ai_json", fake_ai)
    monkeypatch.setattr(discovery, "_post_json", fake_post)
    result = discovery.run_tenant_discovery(tenant)
    assert result == {"status": "COMPLETED", "created": 1, "profiles_found": 2}
    assert len(calls) == 2
    assert all(call[2] == "test-apify-token" for call in calls)
    prospect = Prospect.objects.get(tenant=tenant)
    assert prospect.instagram_handle == "sushi_real"
    assert prospect.discovery_score == 84
    assert prospect.territory.name == "Santiago"
    assert "Publica platos de camarón" in prospect.notes
    assert Opportunity.objects.get().prospect == prospect
    assert discovery.run_tenant_discovery(tenant)["status"] == "already_completed"
    assert discovery.run_tenant_discovery(tenant, force=True)["created"] == 0
    assert Prospect.objects.count() == 1
    evaluations = list(DiscoveryEvaluation.objects.filter(tenant=tenant))
    assert len(evaluations) == 4
    assert len({row.batch_id for row in evaluations}) == 2
    assert {row.decision for row in evaluations if row.username == "sushi_real"} == {"CREATED", "EXISTING"}
    assert all(row.decision == "REJECTED" and "no relevante" in row.reason
               for row in evaluations if row.username == "usuario_personal")


@pytest.mark.django_db
def test_discovery_status_is_tenant_private_and_trigger_requires_secret(monkeypatch, discovery_company):
    tenant, user = discovery_company
    monkeypatch.delenv("MINDCASE_API_KEY", raising=False)
    viewer = get_user_model().objects.create_user("marina-viewer", "marina-viewer@example.test", "password")
    Membership.objects.create(tenant=tenant, user=viewer, role=Membership.Role.VIEWER)
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.setenv("APIFY_TOKEN", "test-apify-token")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-token")
    status_url = reverse("prospect-discovery-status")
    trigger_url = reverse("prospect-discovery-run")
    assert APIClient().get(status_url, HTTP_HOST="marina.localhost").status_code == 403
    client = APIClient()
    client.force_authenticate(user)
    assert client.get(status_url, HTTP_HOST="marina.localhost").json()["status"] == "NOT_STARTED"
    assert APIClient().post(trigger_url, HTTP_AUTHORIZATION="Bearer wrong", HTTP_HOST="marina.localhost").status_code == 403
    viewer_client = APIClient()
    viewer_client.force_authenticate(viewer)
    assert viewer_client.patch(status_url, {"enabled": True}, format="json", HTTP_HOST="marina.localhost").status_code == 403
    assert APIClient().post(trigger_url, HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost").json()["status"] == "no_due_tenants"
    enabled = client.patch(status_url, {"enabled": True}, format="json", HTTP_HOST="marina.localhost")
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True
    assert enabled.json()["status"] == "NOT_STARTED"

    monkeypatch.setattr(discovery, "_choose_hashtags", lambda products, territories: ["sushisantiago"])
    monkeypatch.setattr(discovery, "_search_profiles", lambda hashtags: [])
    response = APIClient().post(trigger_url, HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost")
    assert response.status_code == 200
    assert response.json()["tenant"] == str(tenant.id)
    assert DiscoveryRun.objects.get(tenant=tenant).status == DiscoveryRun.Status.COMPLETED
    assert client.get(status_url, HTTP_HOST="marina.localhost").json()["profiles_found"] == 0


def test_instagram_duplicate_identity_uses_profile_not_shared_domain():
    assert normalized_domain("https://www.instagram.com/sushi_real/") == "instagram.com/sushi_real"
    assert normalized_domain("https://instagram.com/otro/?x=1") == "instagram.com/otro"


def test_mindcase_profile_response_preserves_public_business_evidence():
    profiles = discovery._normalize_mindcase_profiles([
        {"username": "sushi_real", "fullName": "Sushi Real", "bio": "Restaurante en Santiago",
         "businessAccount": True, "businessCategory": "Restaurant", "businessCity": "Santiago",
         "private": False, "recentPosts": [{"caption": "Camarones para nuestros clientes"}]},
        {"username": "privado", "private": True, "recentPosts": [{"caption": "No público"}]},
    ], "sushi Santiago")
    assert profiles == [{
        "username": "sushi_real", "name": "Sushi Real", "bio": "Restaurante en Santiago",
        "business_category": "Restaurant", "business_city": "Santiago", "business_account": True,
        "posts": ["Camarones para nuestros clientes"], "search_terms": ["sushi Santiago"],
    }]


def test_mindcase_sdk_column_names_are_normalized():
    profiles = discovery._normalize_mindcase_profiles([
        {"Username": "sushi_real", "Full Name": "Sushi Real", "Bio": "Restaurante en Santiago",
         "Business Account": True, "Business Category": "Restaurant", "Private": False,
         "Latest Posts": [{"caption": "Servimos camarones"}]},
    ], "sushi Santiago")
    assert profiles[0]["username"] == "sushi_real"
    assert profiles[0]["business_account"] is True
    assert profiles[0]["posts"] == ["Servimos camarones"]


@pytest.mark.django_db
def test_mindcase_query_rotates_only_through_configured_localities(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    territory = Territory.objects.get(tenant=tenant)
    territory.region = "Los Lagos"
    territory.localities = ["Puerto Montt", "Osorno"]
    territory.save(update_fields=["region", "localities"])
    product = Product.objects.get(tenant=tenant)
    calls = []

    def fake_ai(system, data):
        calls.append(data["location"])
        return {"buyer_type": "restaurantes de mariscos"}

    monkeypatch.setattr(discovery, "_ai_json", fake_ai)
    first = discovery._choose_mindcase_query([product], [territory], "cafeterías Chile")
    second = discovery._choose_mindcase_query([product], [territory], first)
    assert first == "restaurantes de mariscos Puerto Montt"
    assert second == "restaurantes de mariscos Osorno"
    assert calls == ["Puerto Montt", "Osorno"]
    monkeypatch.setattr(discovery, "_ai_json", lambda system, data: {"buyer_type": "cafeterías Santiago"})
    with pytest.raises(discovery.DiscoveryError, match="fuera del territorio"):
        discovery._choose_mindcase_query([product], [territory])


@pytest.mark.django_db
def test_qualification_rejects_profiles_outside_or_without_verified_location(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    territory = Territory.objects.get(tenant=tenant)
    territory.region = "Los Lagos"
    territory.localities = ["Puerto Montt", "Osorno"]
    territory.save(update_fields=["region", "localities"])
    profiles = [
        {"username": "local", "bio": "Cafetería en Puerto Montt", "business_city": "", "posts": []},
        {"username": "santiago", "bio": "Cafetería en Santiago", "business_city": "Santiago", "posts": []},
        {"username": "sin_ciudad", "bio": "Cafetería chilena", "business_city": "", "posts": []},
    ]
    monkeypatch.setattr(discovery, "_ai_json", lambda system, data: {"prospects": [
        {"username": profile["username"], "relevant": True, "score": 90, "industry": "FOOD_SERVICE",
         "reason": "Vende café.", "city": city}
        for profile, city in zip(profiles, ["Puerto Montt", "Santiago", "Puerto Montt"])
    ]})
    qualified, decisions = discovery._qualify(profiles, [Product.objects.get(tenant=tenant)], [territory])
    assert set(qualified) == {"local"}
    assert decisions["santiago"]["accepted"] is False
    assert "fuera" in decisions["santiago"]["reason"]
    assert decisions["sin_ciudad"]["accepted"] is False
    assert "no aparece" in decisions["sin_ciudad"]["reason"]


@pytest.mark.django_db
def test_discovery_requires_active_territory_before_paid_submission(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    Territory.objects.filter(tenant=tenant).update(is_active=False)
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setattr(discovery, "_post_json", lambda *args, **kwargs: pytest.fail("No se debe cobrar una búsqueda sin territorio"))
    result = discovery.run_tenant_discovery(tenant)
    assert result["status"] == DiscoveryRun.Status.SKIPPED
    assert DiscoveryRun.objects.get(tenant=tenant).error == "Crea al menos un territorio activo antes de buscar."


def test_ai_json_uses_deepseek_without_openai_key(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    calls = []

    def fake_post(url, payload, bearer, timeout):
        calls.append((url, payload, bearer, timeout))
        return {"choices": [{"message": {"content": '{"query":"sushi Santiago"}'}}]}

    monkeypatch.setattr(discovery, "_post_json", fake_post)
    assert discovery._ai_json("Devuelve JSON", {"products": ["Camarón"]}) == {"query": "sushi Santiago"}
    url, payload, bearer, timeout = calls[0]
    assert url == "https://api.deepseek.com/chat/completions"
    assert payload["model"] == "deepseek-chat"
    assert payload["response_format"] == {"type": "json_object"}
    assert bearer == "test-deepseek-token"
    assert timeout == 20


def test_ai_json_uses_openai_only_without_deepseek_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-token")
    calls = []

    def fake_post(url, payload, bearer, timeout):
        calls.append((url, payload["model"], bearer))
        return {"choices": [{"message": {"content": '{"query":"sushi Santiago"}'}}]}

    monkeypatch.setattr(discovery, "_post_json", fake_post)
    assert discovery._ai_json("Devuelve JSON", {}) == {"query": "sushi Santiago"}
    assert calls == [("https://api.openai.com/v1/chat/completions", "gpt-4o-mini", "test-openai-token")]


@pytest.mark.parametrize("provider_code,expected", [
    ("insufficient_quota", "saldo de API"),
    ("rate_limit_exceeded", "límite de solicitudes"),
    (None, "HTTP 429"),
])
def test_openai_429_identifies_actionable_cause_without_exposing_response(monkeypatch, provider_code, expected):
    body = json.dumps({"error": {"code": provider_code, "message": "private provider detail"}}).encode()

    def fail_request(request, timeout):
        raise HTTPError(request.full_url, 429, "Too Many Requests", {}, BytesIO(body))

    monkeypatch.setattr(discovery, "urlopen", fail_request)
    with pytest.raises(discovery.DiscoveryError, match=expected) as raised:
        discovery._post_json("https://api.openai.com/v1/chat/completions", {}, "test-token")
    assert "private provider detail" not in str(raised.value)


@pytest.mark.parametrize("failure", [TimeoutError(), URLError(TimeoutError())])
def test_mindcase_timeout_identifies_provider_and_wait(monkeypatch, failure):
    def fail_request(request, timeout):
        raise failure

    monkeypatch.setattr(discovery, "urlopen", fail_request)
    with pytest.raises(discovery.DiscoveryError, match="api.mindcase.co agotó el tiempo de espera de 20 segundos"):
        discovery._post_json(discovery.MINDCASE_PROFILES_URL, {"params": {"query": "sushi Santiago"}}, "test-token", timeout=20)


def test_mindcase_status_timeout_uses_get_without_exposing_key(monkeypatch):
    def fail_request(request, timeout):
        assert request.get_method() == "GET"
        assert request.full_url == discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678")
        raise TimeoutError()

    monkeypatch.setattr(discovery, "urlopen", fail_request)
    with pytest.raises(discovery.DiscoveryError, match="api.mindcase.co agotó el tiempo de espera de 20 segundos") as raised:
        discovery._get_json(discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"), "test-secret", timeout=20)
    assert "test-secret" not in str(raised.value)


def test_mindcase_completed_job_accepts_verified_id_and_empty_results(monkeypatch):
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    calls = []

    def fake_get(url, bearer, timeout):
        calls.append((url, bearer, timeout))
        if len(calls) == 1:
            return {"id": "11111111-2222-4333-8444-555555555555", "status": "completed", "row_count": 0}
        return {"status": "completed", "row_count": 0, "data": []}

    monkeypatch.setattr(discovery, "_get_json", fake_get)
    job_id = "11111111-2222-4333-8444-555555555555"
    assert discovery._read_mindcase_job(job_id) == []
    assert calls == [
        (discovery.MINDCASE_JOB_STATUS_URL.format(job_id=job_id), "test-mindcase-token", 20),
        (discovery.MINDCASE_JOB_RESULTS_URL.format(job_id=job_id), "test-mindcase-token", 20),
    ]


@pytest.mark.parametrize("returned_id", [None, "other_job_id"])
def test_mindcase_status_rejects_missing_or_wrong_id_before_results(monkeypatch, returned_id):
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    calls = []

    def fake_get(url, bearer, timeout):
        calls.append(url)
        return {"id": returned_id, "status": "completed", "row_count": 2}

    monkeypatch.setattr(discovery, "_get_json", fake_get)
    with pytest.raises(discovery.DiscoveryError, match="identificador"):
        discovery._read_mindcase_job("job_12345678")
    assert calls == [discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678")]


@pytest.mark.django_db
def test_mindcase_job_is_reused_until_results_arrive(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    calls = []

    def fake_ai(system, data):
        if "clave buyer_type" in system:
            assert data["location"] == "Santiago"
            return {"buyer_type": "sushi"}
        assert data["profiles"][0]["bio"] == "Sushi en Santiago"
        assert data["profiles"][0]["posts"] == ["Servimos camarones"]
        return {"prospects": [{"username": "sushi_real", "relevant": True, "score": 85,
                              "industry": "FOOD_SERVICE", "reason": "Restaurante que sirve camarones.", "city": ""}]}

    def fake_post(url, payload, bearer, timeout=35):
        calls.append((url, payload, bearer, timeout))
        return {"id": "job_12345678", "status": "running"}

    reads = []

    def fake_get(url, bearer, timeout=20):
        reads.append((url, bearer, timeout))
        if url == discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"):
            return {"id": "job_12345678", "status": "running" if len(reads) == 1 else "completed", "row_count": 1}
        assert url == discovery.MINDCASE_JOB_RESULTS_URL.format(job_id="job_12345678")
        return {"status": "completed", "row_count": 1, "data": [
            {"username": "sushi_real", "fullName": "Sushi Real", "bio": "Sushi en Santiago",
             "businessCity": "Santiago", "private": False,
             "recentPosts": [{"caption": "Servimos camarones"}]},
        ]}

    monkeypatch.setattr(discovery, "_ai_json", fake_ai)
    monkeypatch.setattr(discovery, "_post_json", fake_post)
    monkeypatch.setattr(discovery, "_get_json", fake_get)
    assert discovery.run_tenant_discovery(tenant)["status"] == "PENDING"
    assert discovery.run_tenant_discovery(tenant)["status"] == "PENDING"
    assert discovery.run_tenant_discovery(tenant)["status"] == "poll_not_due"
    run = DiscoveryRun.objects.get(tenant=tenant)
    run.mindcase_last_polled_at = timezone.now() - timedelta(minutes=16)
    run.save(update_fields=["mindcase_last_polled_at"])
    assert discovery.run_tenant_discovery(tenant) == {"status": "COMPLETED", "created": 1, "profiles_found": 1}
    assert calls == [(discovery.MINDCASE_PROFILES_URL, {"params": {"query": "sushi Santiago"}}, "test-mindcase-token", 20)]
    assert reads == [
        (discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"), "test-mindcase-token", 20),
        (discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"), "test-mindcase-token", 20),
        (discovery.MINDCASE_JOB_RESULTS_URL.format(job_id="job_12345678"), "test-mindcase-token", 20),
    ]
    assert Prospect.objects.get(tenant=tenant).city == "Santiago"
    run = DiscoveryRun.objects.get(tenant=tenant)
    assert run.hashtags == ["sushi Santiago"]
    assert run.mindcase_job_id == "job_12345678"
    assert DiscoveryEvaluation.objects.get(tenant=tenant, username="sushi_real").decision == DiscoveryEvaluation.Decision.CREATED


@pytest.mark.django_db
def test_discovery_evaluation_history_records_omissions_and_existing_profiles(monkeypatch, discovery_company):
    tenant, user = discovery_company
    monkeypatch.delenv("MINDCASE_API_KEY", raising=False)
    monkeypatch.setenv("APIFY_TOKEN", "test-apify-token")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-token")
    Prospect.objects.create(tenant=tenant, name="Sushi conocido", source="Manual", instagram_handle="conocido")
    monkeypatch.setattr(discovery, "_choose_hashtags", lambda products, territories: ["sushisantiago"])
    monkeypatch.setattr(discovery, "_search_profiles", lambda hashtags: [
        {"username": handle, "name": handle, "bio": "", "business_category": "", "business_city": "Santiago" if handle in ("conocido", "nuevo") else "", "business_account": True, "posts": [], "search_terms": hashtags}
        for handle in ("conocido", "nuevo", "rechazado", "bajo", "omitido")
    ])
    monkeypatch.setattr(discovery, "_ai_json", lambda system, data: {"prospects": [
        {"username": "conocido", "relevant": True, "score": 85, "industry": "FOOD_SERVICE", "reason": "Sirve mariscos.", "city": ""},
        {"username": "nuevo", "relevant": True, "score": 90, "industry": "FOOD_SERVICE", "reason": "Compra camarones.", "city": ""},
        {"username": "rechazado", "relevant": False, "score": 20, "industry": "", "reason": "Cuenta personal.", "city": ""},
        {"username": "bajo", "relevant": True, "score": 45, "industry": "FOOD_SERVICE", "reason": "Señal comercial débil.", "city": ""},
    ]})
    assert discovery.run_tenant_discovery(tenant)["created"] == 1
    rows = {row.username: row for row in DiscoveryEvaluation.objects.filter(tenant=tenant)}
    assert {handle: row.decision for handle, row in rows.items()} == {
        "conocido": "EXISTING", "nuevo": "CREATED", "rechazado": "REJECTED", "bajo": "REJECTED", "omitido": "NOT_EVALUATED",
    }
    assert rows["rechazado"].reason == "Cuenta personal."
    assert "inferior al mínimo" in rows["bajo"].reason
    assert rows["omitido"].score is None
    assert len({row.batch_id for row in rows.values()}) == 1
    client = APIClient()
    client.force_authenticate(user)
    response = client.get(reverse("prospect-discovery-evaluations"), HTTP_HOST="marina.localhost")
    assert response.status_code == 200
    assert response.json()["total"] == 5
    assert len(response.json()["results"]) == 5
    assert APIClient().get(reverse("prospect-discovery-evaluations"), HTTP_HOST="marina.localhost").status_code == 403
    other_tenant = Tenant.objects.create(name="Otra", slug="otra", headline="Otra", logo_path="/b.svg")
    DiscoveryEvaluation.objects.create(tenant=other_tenant, batch_id=rows["nuevo"].batch_id,
                                       username="secreto", name="Secreto", search_term="secreto", decision="REJECTED")
    assert client.get(reverse("prospect-discovery-evaluations"), HTTP_HOST="marina.localhost").json()["total"] == 5


@pytest.mark.django_db
def test_scheduler_retries_skipped_tenant_when_products_are_ready(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    DiscoveryRun.objects.create(tenant=tenant, enabled=True, status=DiscoveryRun.Status.SKIPPED,
                                started_at=timezone.now(), finished_at=timezone.now())
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-token")
    monkeypatch.setattr(discovery, "_choose_mindcase_query", lambda products, territories, previous_query="": "sushi Santiago")
    monkeypatch.setattr(discovery, "_start_mindcase_job", lambda query: ("job_12345678", []))
    response = APIClient().post(reverse("prospect-discovery-run"), HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost")
    assert response.status_code == 200
    assert response.json()["status"] == DiscoveryRun.Status.COMPLETED
    assert DiscoveryRun.objects.get(tenant=tenant).hashtags == ["sushi Santiago"]


@pytest.mark.django_db
def test_existing_job_with_zero_results_completes_without_new_extraction(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.PENDING,
        mindcase_job_id="job_12345678", mindcase_submission_attempted=True,
        mindcase_submitted_at=timezone.now(), hashtags=["sushi Santiago"],
    )
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setattr(discovery, "_post_json", lambda *args, **kwargs: pytest.fail("No se debe crear otro job"))
    calls = []

    def fake_get(url, bearer, timeout):
        calls.append(url)
        if len(calls) == 1:
            return {"id": "job_12345678", "status": "completed", "row_count": 0}
        return {"status": "completed", "row_count": 0, "data": []}

    monkeypatch.setattr(discovery, "_get_json", fake_get)
    assert discovery.run_tenant_discovery(tenant) == {"status": "COMPLETED", "created": 0, "profiles_found": 0}
    run.refresh_from_db()
    assert run.mindcase_job_id == "job_12345678"
    assert run.status == DiscoveryRun.Status.COMPLETED
    assert Prospect.objects.filter(tenant=tenant).count() == 0
    assert calls == [
        discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"),
        discovery.MINDCASE_JOB_RESULTS_URL.format(job_id="job_12345678"),
    ]


@pytest.mark.django_db
def test_irrelevant_mindcase_batch_pauses_future_paid_searches(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    DiscoveryRun.objects.create(tenant=tenant, enabled=True)
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.setattr(discovery, "_choose_mindcase_query", lambda *args: "cafeterías Puerto Montt")
    monkeypatch.setattr(discovery, "_start_mindcase_job", lambda query: ("job_12345678", {"status": "completed"}))
    monkeypatch.setattr(discovery, "_read_mindcase_job", lambda job_id: [
        {"username": f"celebridad_{index}", "fullName": f"Celebridad {index}", "bio": "Actor internacional"}
        for index in range(5)
    ])
    monkeypatch.setattr(discovery, "_ai_json", lambda system, data: {"prospects": [
        {"username": f"celebridad_{index}", "relevant": False, "score": 0, "reason": "Sin negocio comprador."}
        for index in range(5)
    ]})
    result = discovery.run_tenant_discovery(tenant)
    assert result == {"status": "COMPLETED", "created": 0, "profiles_found": 5}
    run = DiscoveryRun.objects.get(tenant=tenant)
    assert run.enabled is False
    assert "pausó" in run.error
    assert DiscoveryEvaluation.objects.filter(tenant=tenant, decision="REJECTED").count() == 5
    scheduled = APIClient().post(reverse("prospect-discovery-run"),
                                 HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost")
    assert scheduled.json()["status"] == "no_due_tenants"


@pytest.mark.django_db
def test_migration_pauses_an_existing_irrelevant_batch(discovery_company):
    from django.apps import apps
    from uuid import uuid4

    tenant, _ = discovery_company
    batch_id = uuid4()
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.COMPLETED,
        profiles_found=5, prospects_created=0, evaluation_batch_id=batch_id,
    )
    for index in range(5):
        DiscoveryEvaluation.objects.create(
            tenant=tenant, batch_id=batch_id, username=f"irrelevante_{index}",
            name=f"Irrelevante {index}", search_term="cafeterías Puerto Montt",
            decision=DiscoveryEvaluation.Decision.REJECTED,
        )
    migration = importlib.import_module("apps.prospecting.migrations.0008_pause_irrelevant_discovery_runs")
    migration.pause_irrelevant_runs(apps, None)
    run.refresh_from_db()
    assert run.enabled is False
    assert "pausó" in run.error


@pytest.mark.django_db
def test_unconfirmed_mindcase_submission_pauses_and_cannot_resubmit(monkeypatch, discovery_company):
    tenant, user = discovery_company
    run = DiscoveryRun.objects.create(tenant=tenant, enabled=True)
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.setattr(discovery, "_choose_mindcase_query", lambda products, territories, previous_query="": "sushi Santiago")
    calls = []

    def fail_start(query):
        calls.append(query)
        raise discovery.DiscoveryError("api.mindcase.co agotó el tiempo de espera de 20 segundos.")

    monkeypatch.setattr(discovery, "_start_mindcase_job", fail_start)
    with pytest.raises(discovery.DiscoveryError):
        discovery.run_tenant_discovery(tenant)
    run.refresh_from_db()
    assert run.enabled is False
    assert run.mindcase_submission_attempted is True
    assert discovery.run_tenant_discovery(tenant)["status"] == "unconfirmed_submission"
    assert calls == ["sushi Santiago"]
    client = APIClient()
    client.force_authenticate(user)
    response = client.patch(reverse("prospect-discovery-status"), {"enabled": True}, format="json", HTTP_HOST="marina.localhost")
    assert response.status_code == 409


@pytest.mark.django_db
@pytest.mark.parametrize("provider_status", ["failed", "cancelled"])
def test_terminal_mindcase_job_stops_polling_without_new_submission(monkeypatch, discovery_company, provider_status):
    tenant, _ = discovery_company
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.PENDING,
        mindcase_job_id="job_12345678", mindcase_submission_attempted=True,
        mindcase_submitted_at=timezone.now(), hashtags=["sushi Santiago"],
    )
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setattr(discovery, "_post_json", lambda *args, **kwargs: pytest.fail("No se debe crear otro job"))
    monkeypatch.setattr(discovery, "_get_json", lambda *args, **kwargs: {"id": "job_12345678", "status": provider_status})
    with pytest.raises(discovery.MindcaseTerminalError):
        discovery.run_tenant_discovery(tenant)
    run.refresh_from_db()
    assert run.status == DiscoveryRun.Status.FAILED
    assert run.enabled is False
    assert run.mindcase_job_id == "job_12345678"


@pytest.mark.django_db
def test_incomplete_mindcase_results_keep_job_id_for_retry(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.PENDING,
        mindcase_job_id="job_12345678", mindcase_submission_attempted=True,
        mindcase_submitted_at=timezone.now(), hashtags=["sushi Santiago"],
    )
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setattr(discovery, "_post_json", lambda *args, **kwargs: pytest.fail("No se debe crear otro job"))
    urls = []

    def fake_get(url, *args, **kwargs):
        urls.append(url)
        return {"id": "job_12345678", "status": "completed"} if len(urls) == 1 else {"status": "completed"}

    monkeypatch.setattr(discovery, "_get_json", fake_get)
    with pytest.raises(discovery.DiscoveryError, match="sin entregar una lista"):
        discovery.run_tenant_discovery(tenant)
    run.refresh_from_db()
    assert run.mindcase_job_id == "job_12345678"
    assert run.enabled is True
    assert urls == [
        discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678"),
        discovery.MINDCASE_JOB_RESULTS_URL.format(job_id="job_12345678"),
    ]


@pytest.mark.django_db
def test_mindcase_job_max_wait_stops_polling(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.PENDING,
        mindcase_job_id="job_12345678", mindcase_submission_attempted=True,
        mindcase_submitted_at=timezone.now() - timedelta(hours=25), hashtags=["sushi Santiago"],
    )
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    monkeypatch.setattr(discovery, "_get_json", lambda *args, **kwargs: pytest.fail("No se debe consultar un job vencido"))
    with pytest.raises(discovery.MindcaseTerminalError, match="tiempo máximo"):
        discovery.run_tenant_discovery(tenant)
    run.refresh_from_db()
    assert run.enabled is False
    assert run.mindcase_job_id == "job_12345678"


@pytest.mark.django_db
def test_scheduler_does_not_run_without_provider_credentials(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    DiscoveryRun.objects.create(tenant=tenant, enabled=True)
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.delenv("MINDCASE_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = APIClient().post(reverse("prospect-discovery-run"), HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost")
    assert response.status_code == 503
    assert DiscoveryRun.objects.get(tenant=tenant).status == DiscoveryRun.Status.SKIPPED


@pytest.mark.django_db
def test_browser_poll_reuses_job_and_respects_interval(monkeypatch, discovery_company):
    tenant, owner = discovery_company
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.PENDING,
        mindcase_job_id="job_12345678", mindcase_submission_attempted=True,
        mindcase_submitted_at=timezone.now() - timedelta(minutes=16),
        hashtags=["cafeterías Puerto Montt"],
    )
    client = APIClient()
    client.force_authenticate(owner)
    url = reverse("prospect-discovery-poll")
    reads = []
    monkeypatch.setattr(discovery, "_start_mindcase_job", lambda *args: pytest.fail("No debe crear un job"))
    monkeypatch.setattr(discovery, "_get_json", lambda url, *args, **kwargs: (reads.append(url) or {"id": "job_12345678", "status": "running"}))
    response = client.get(reverse("prospect-discovery-status"), HTTP_HOST="marina.localhost")
    assert response.json()["mindcase_next_poll_at"] is not None
    assert client.post(url, HTTP_HOST="marina.localhost").json()["status"] == "PENDING"
    assert reads == [discovery.MINDCASE_JOB_STATUS_URL.format(job_id="job_12345678")]
    run.refresh_from_db()
    assert run.mindcase_job_id == "job_12345678"
    assert client.post(url, HTTP_HOST="marina.localhost").json()["status"] == "poll_not_due"
    assert len(reads) == 1


@pytest.mark.django_db
def test_browser_poll_requires_existing_job_and_write_role(monkeypatch, discovery_company):
    tenant, owner = discovery_company
    viewer = get_user_model().objects.create_user("poll-viewer", "poll-viewer@example.test", "password")
    Membership.objects.create(tenant=tenant, user=viewer, role=Membership.Role.VIEWER)
    url = reverse("prospect-discovery-poll")
    owner_client = APIClient()
    owner_client.force_authenticate(owner)
    viewer_client = APIClient()
    viewer_client.force_authenticate(viewer)
    assert viewer_client.post(url, HTTP_HOST="marina.localhost").status_code == 403
    assert owner_client.post(url, HTTP_HOST="marina.localhost").status_code == 409
    DiscoveryRun.objects.create(tenant=tenant, enabled=True, status=DiscoveryRun.Status.COMPLETED,
                                mindcase_job_id="job_12345678")
    assert owner_client.post(url, HTTP_HOST="marina.localhost").status_code == 409


@pytest.mark.django_db
def test_manual_discovery_bypasses_daily_wait_but_reuses_existing_job(monkeypatch, discovery_company):
    tenant, owner = discovery_company
    client = APIClient()
    client.force_authenticate(owner)
    url = reverse("prospect-discovery-test")
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    run = DiscoveryRun.objects.create(
        tenant=tenant, enabled=True, status=DiscoveryRun.Status.COMPLETED,
        started_at=timezone.now() - timedelta(hours=2),
        finished_at=timezone.now() - timedelta(hours=2),
        mindcase_job_id="previous-job", hashtags=["cafeterías Santiago"],
    )
    started = []
    monkeypatch.setattr(discovery, "_choose_mindcase_query", lambda *args: "cafeterías Puerto Montt")
    monkeypatch.setattr(discovery, "_start_mindcase_job", lambda query: (started.append(query) or "new-job", {"status": "running"}))
    response = client.post(url, HTTP_HOST="marina.localhost")
    assert response.status_code == 200
    assert response.json()["status"] == "PENDING"
    assert started == ["cafeterías Puerto Montt"]
    run.refresh_from_db()
    assert run.mindcase_job_id == "new-job"
    assert run.hashtags == ["cafeterías Puerto Montt"]
    assert client.post(url, HTTP_HOST="marina.localhost").status_code == 409
    assert started == ["cafeterías Puerto Montt"]


@pytest.mark.django_db
def test_manual_discovery_checks_role_pause_and_short_cooldown(monkeypatch, discovery_company):
    tenant, owner = discovery_company
    viewer = get_user_model().objects.create_user("manual-viewer", "manual-viewer@example.test", "password")
    Membership.objects.create(tenant=tenant, user=viewer, role=Membership.Role.VIEWER)
    monkeypatch.setenv("MINDCASE_API_KEY", "test-mindcase-token")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-token")
    url = reverse("prospect-discovery-test")
    client = APIClient()
    client.force_authenticate(owner)
    viewer_client = APIClient()
    viewer_client.force_authenticate(viewer)
    assert viewer_client.post(url, HTTP_HOST="marina.localhost").status_code == 403
    assert client.post(url, HTTP_HOST="marina.localhost").status_code == 409
    run = DiscoveryRun.objects.create(tenant=tenant, enabled=True, status=DiscoveryRun.Status.COMPLETED,
                                      finished_at=timezone.now() - timedelta(minutes=2))
    assert client.post(url, HTTP_HOST="marina.localhost").status_code == 429
    run.mindcase_submission_attempted = True
    run.status = DiscoveryRun.Status.FAILED
    run.finished_at = timezone.now() - timedelta(minutes=10)
    run.save(update_fields=["mindcase_submission_attempted", "status", "finished_at"])
    assert client.post(url, HTTP_HOST="marina.localhost").status_code == 409
