import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.catalog.models import Category, IndustrySegment, Product
from apps.prospecting import discovery
from apps.prospecting.models import DiscoveryRun, Opportunity, Prospect, Territory
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


@pytest.mark.django_db
def test_discovery_status_is_tenant_private_and_trigger_requires_secret(monkeypatch, discovery_company):
    tenant, user = discovery_company
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


@pytest.mark.django_db
def test_scheduler_does_not_run_without_provider_credentials(monkeypatch, discovery_company):
    tenant, _ = discovery_company
    DiscoveryRun.objects.create(tenant=tenant, enabled=True)
    monkeypatch.setenv("AUTOMATION_TOKEN", "test-automation-token")
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = APIClient().post(reverse("prospect-discovery-run"), HTTP_AUTHORIZATION="Bearer test-automation-token", HTTP_HOST="marina.localhost")
    assert response.status_code == 503
    assert DiscoveryRun.objects.get(tenant=tenant).status == DiscoveryRun.Status.SKIPPED
