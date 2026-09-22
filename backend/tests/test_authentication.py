import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.tenancy.models import Membership, Tenant, TenantDomain


@pytest.fixture
def auth_context(db):
    tenant_a = Tenant.objects.create(
        name="Empresa A",
        slug="auth-empresa-a",
        headline="Empresa A",
        logo_path="/static/demo/empresa-a.svg",
        featured_offerings=[],
    )
    tenant_b = Tenant.objects.create(
        name="Empresa B",
        slug="auth-empresa-b",
        headline="Empresa B",
        logo_path="/static/demo/empresa-b.svg",
        featured_offerings=[],
    )
    TenantDomain.objects.create(
        tenant=tenant_a,
        hostname="empresa-a.localhost",
        is_primary=True,
        is_verified=True,
    )
    TenantDomain.objects.create(
        tenant=tenant_b,
        hostname="empresa-b.localhost",
        is_primary=True,
        is_verified=True,
    )
    user = get_user_model().objects.create_user(
        username="owner-a",
        email="owner-a@example.test",
        password="synthetic-password-123",
    )
    Membership.objects.create(tenant=tenant_a, user=user, role=Membership.Role.OWNER)
    return tenant_a, tenant_b, user


def csrf_client(hostname: str) -> tuple[APIClient, str]:
    client = APIClient(enforce_csrf_checks=True)
    response = client.get(reverse("auth-session"), HTTP_HOST=hostname)
    return client, response.json()["csrf_token"]


@pytest.mark.django_db
def test_session_endpoint_sets_csrf_without_private_data(auth_context):
    client = APIClient()
    response = client.get(reverse("auth-session"), HTTP_HOST="empresa-a.localhost")

    assert response.status_code == 200
    assert response.json()["authenticated"] is False
    assert response.json()["csrf_token"]
    assert "sessionid" not in response.cookies
    assert response["Cache-Control"] == "no-store"


@pytest.mark.django_db
def test_login_requires_csrf(auth_context):
    response = APIClient(enforce_csrf_checks=True).post(
        reverse("auth-login"),
        {"email": "owner-a@example.test", "password": "synthetic-password-123"},
        format="json",
        HTTP_HOST="empresa-a.localhost",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_login_creates_tenant_bound_session_and_logout_invalidates_it(auth_context):
    client, csrf_token = csrf_client("empresa-a.localhost")
    login_response = client.post(
        reverse("auth-login"),
        {"email": "OWNER-A@example.test", "password": "synthetic-password-123"},
        format="json",
        HTTP_HOST="empresa-a.localhost",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert login_response.status_code == 200
    assert login_response.json()["authenticated"] is True
    assert login_response.json()["tenant"]["name"] == "Empresa A"
    assert login_response.json()["tenant"]["role"] == Membership.Role.OWNER
    assert login_response.json()["user"]["email"] == "owner-a@example.test"
    assert "password" not in str(login_response.json()).lower()

    session_response = client.get(reverse("auth-session"), HTTP_HOST="empresa-a.localhost")
    assert session_response.json()["authenticated"] is True

    logout_response = client.post(
        reverse("auth-logout"),
        format="json",
        HTTP_HOST="empresa-a.localhost",
        HTTP_X_CSRFTOKEN=session_response.json()["csrf_token"],
    )
    assert logout_response.status_code == 200
    assert client.get(reverse("auth-session"), HTTP_HOST="empresa-a.localhost").json()["authenticated"] is False


@pytest.mark.django_db
def test_tenant_a_credentials_are_rejected_on_tenant_b_domain(auth_context):
    client, csrf_token = csrf_client("empresa-b.localhost")
    response = client.post(
        reverse("auth-login"),
        {"email": "owner-a@example.test", "password": "synthetic-password-123"},
        format="json",
        HTTP_HOST="empresa-b.localhost",
        HTTP_X_CSRFTOKEN=csrf_token,
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "No fue posible iniciar sesión con los datos proporcionados."}
    assert "sessionid" not in response.cookies


@pytest.mark.django_db
def test_invalid_email_and_invalid_password_return_same_error(auth_context):
    responses = []
    for email, password in [
        ("missing@example.test", "synthetic-password-123"),
        ("owner-a@example.test", "wrong-password"),
    ]:
        client, csrf_token = csrf_client("empresa-a.localhost")
        responses.append(
            client.post(
                reverse("auth-login"),
                {"email": email, "password": password},
                format="json",
                HTTP_HOST="empresa-a.localhost",
                HTTP_X_CSRFTOKEN=csrf_token,
            )
        )

    assert [response.status_code for response in responses] == [400, 400]
    assert responses[0].json() == responses[1].json()

