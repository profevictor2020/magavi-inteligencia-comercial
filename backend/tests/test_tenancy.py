import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse
from rest_framework.test import APIClient

from apps.tenancy.models import Membership, Tenant, TenantDomain


def tenant_payload(slug: str, name: str, logo: str, color: str) -> dict:
    return {
        "slug": slug,
        "name": name,
        "description": f"Descripción pública de {name}",
        "headline": f"Propuesta principal de {name}",
        "logo_path": logo,
        "primary_color": color,
        "secondary_color": "#F4BC57",
        "contact_email": f"{slug}@example.test",
        "contact_phone": "+56 9 0000 0000",
        "featured_offerings": [{"name": f"Servicio {name}", "description": "Contenido sintético."}],
    }


@pytest.fixture
def tenant_a(db):
    tenant = Tenant.objects.create(**tenant_payload("empresa_a", "Empresa A", "/static/demo/empresa-a.svg", "#145C5A"))
    TenantDomain.objects.create(
        tenant=tenant,
        hostname="empresa-a.localhost",
        is_primary=True,
        is_verified=True,
    )
    return tenant


@pytest.fixture
def tenant_b(db):
    tenant = Tenant.objects.create(**tenant_payload("empresa_b", "Empresa B", "/static/demo/empresa-b.svg", "#233B66"))
    TenantDomain.objects.create(
        tenant=tenant,
        hostname="empresa-b.localhost",
        is_primary=True,
        is_verified=True,
    )
    return tenant


@pytest.fixture
def users(db):
    model = get_user_model()
    return {
        "owner": model.objects.create_user("owner", "owner@example.test"),
        "admin": model.objects.create_user("admin", "admin@example.test"),
        "viewer": model.objects.create_user("viewer", "viewer@example.test"),
        "tenant_b": model.objects.create_user("tenant-b", "tenant-b@example.test"),
        "outsider": model.objects.create_user("outsider", "outsider@example.test"),
    }


@pytest.fixture
def memberships(tenant_a, tenant_b, users):
    Membership.objects.create(tenant=tenant_a, user=users["owner"], role=Membership.Role.OWNER)
    Membership.objects.create(tenant=tenant_a, user=users["admin"], role=Membership.Role.ADMIN)
    Membership.objects.create(tenant=tenant_a, user=users["viewer"], role=Membership.Role.VIEWER)
    Membership.objects.create(tenant=tenant_b, user=users["tenant_b"], role=Membership.Role.OWNER)


@pytest.mark.django_db
def test_public_landing_resolves_company_a_without_private_fields(tenant_a, tenant_b):
    response = APIClient().get(reverse("public-landing"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 200
    assert response.json()["name"] == "Empresa A"
    assert response.json()["featured_offerings"][0]["name"] == "Servicio Empresa A"
    assert "Empresa B" not in str(response.json())
    assert {"id", "slug", "is_active", "domains", "memberships"}.isdisjoint(response.json())
    assert response["Cache-Control"] == "no-store"
    assert "Host" in response["Vary"]


@pytest.mark.django_db
def test_public_landing_resolves_company_b(tenant_a, tenant_b):
    response = APIClient().get(reverse("public-landing"), HTTP_HOST="empresa-b.localhost")

    assert response.status_code == 200
    assert response.json()["name"] == "Empresa B"
    assert "Empresa A" not in str(response.json())


@pytest.mark.django_db
def test_unknown_hostname_returns_controlled_demo(tenant_a, tenant_b):
    response = APIClient().get(reverse("public-landing"), HTTP_HOST="unknown.localhost")

    assert response.status_code == 200
    assert response.json()["is_demo"] is True
    assert response.json()["name"] == "Empresa demostrativa"
    assert "Empresa A" not in str(response.json())
    assert "Empresa B" not in str(response.json())


@pytest.mark.django_db
def test_disallowed_hostname_is_rejected_before_tenant_resolution(tenant_a):
    response = APIClient().get(reverse("public-landing"), HTTP_HOST="untrusted.example")

    assert response.status_code == 400


@pytest.mark.django_db
def test_unverified_or_inactive_domain_never_resolves(tenant_a):
    domain = tenant_a.domains.get()
    domain.is_verified = False
    domain.save()

    response = APIClient().get(reverse("public-landing"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 200
    assert response.json()["is_demo"] is True


@pytest.mark.django_db
def test_tenant_a_member_cannot_retrieve_tenant_b(tenant_a, tenant_b, users, memberships):
    client = APIClient()
    client.force_authenticate(users["owner"])

    response = client.get(reverse("tenant-detail", kwargs={"tenant_id": tenant_b.id}), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 404


@pytest.mark.django_db
def test_member_from_other_tenant_is_denied_by_hostname(tenant_a, tenant_b, users, memberships):
    client = APIClient()
    client.force_authenticate(users["tenant_b"])

    response = client.get(reverse("tenant-context"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 403


@pytest.mark.django_db
def test_user_without_membership_is_denied(tenant_a, users, memberships):
    client = APIClient()
    client.force_authenticate(users["outsider"])

    response = client.get(reverse("tenant-context"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 403


@pytest.mark.django_db
def test_anonymous_user_cannot_access_private_tenant_context(tenant_a):
    response = APIClient().get(reverse("tenant-context"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_private_app_redirects_anonymous_and_denies_user_without_membership(tenant_a, users):
    anonymous_response = Client().get("/app/", HTTP_HOST="empresa-a.localhost")
    authenticated_client = Client()
    authenticated_client.force_login(users["outsider"])
    outsider_response = authenticated_client.get("/app/", HTTP_HOST="empresa-a.localhost")

    assert anonymous_response.status_code == 302
    assert anonymous_response.url == "/app/login/"
    assert outsider_response.status_code == 403


@pytest.mark.django_db
def test_viewer_can_read_but_cannot_write(tenant_a, users, memberships):
    client = APIClient()
    client.force_authenticate(users["viewer"])

    read_response = client.get(reverse("tenant-context"), HTTP_HOST="empresa-a.localhost")
    write_response = client.patch(
        reverse("tenant-context"),
        {"description": "Cambio no autorizado"},
        format="json",
        HTTP_HOST="empresa-a.localhost",
    )

    assert read_response.status_code == 200
    assert read_response.json()["role"] == Membership.Role.VIEWER
    assert write_response.status_code == 403
    tenant_a.refresh_from_db()
    assert tenant_a.description != "Cambio no autorizado"


@pytest.mark.django_db
@pytest.mark.parametrize("role_key", ["owner", "admin"])
def test_owner_and_admin_can_update_authorized_public_configuration(role_key, tenant_a, users, memberships):
    client = APIClient()
    client.force_authenticate(users[role_key])

    response = client.patch(
        reverse("tenant-context"),
        {"description": f"Actualizado por {role_key}"},
        format="json",
        HTTP_HOST="empresa-a.localhost",
    )

    assert response.status_code == 200
    tenant_a.refresh_from_db()
    assert tenant_a.description == f"Actualizado por {role_key}"


@pytest.mark.django_db
def test_health_remains_public_for_unknown_hostname():
    response = APIClient().get(reverse("health"), HTTP_HOST="unknown.localhost")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
