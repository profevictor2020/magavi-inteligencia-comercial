import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product
from apps.inquiries.models import QuoteRequest
from apps.tenancy.models import Membership, Tenant, TenantDomain


@pytest.fixture
def inquiry_context(db):
    tenant_a = Tenant.objects.create(
        name="Empresa A",
        slug="inquiry-empresa-a",
        headline="Empresa A",
        logo_path="/static/demo/empresa-a.svg",
        featured_offerings=[],
    )
    tenant_b = Tenant.objects.create(
        name="Empresa B",
        slug="inquiry-empresa-b",
        headline="Empresa B",
        logo_path="/static/demo/empresa-b.svg",
        featured_offerings=[],
    )
    TenantDomain.objects.create(tenant=tenant_a, hostname="inquiry-a.localhost", is_primary=True, is_verified=True)
    TenantDomain.objects.create(tenant=tenant_b, hostname="inquiry-b.localhost", is_primary=True, is_verified=True)
    category_a = Category.objects.create(tenant=tenant_a, name="Abarrotes")
    category_b = Category.objects.create(tenant=tenant_b, name="Insumos")
    product_a = Product.objects.create(
        tenant=tenant_a,
        category=category_a,
        name="Café",
        sku="CAFE-1",
        is_available=True,
        is_published=True,
    )
    product_b = Product.objects.create(
        tenant=tenant_b,
        category=category_b,
        name="Té",
        sku="TE-1",
        is_available=True,
        is_published=True,
    )
    owner = get_user_model().objects.create_user("inquiry-owner", "owner@example.test", "password")
    viewer = get_user_model().objects.create_user("inquiry-viewer", "viewer@example.test", "password")
    Membership.objects.create(tenant=tenant_a, user=owner, role=Membership.Role.OWNER)
    Membership.objects.create(tenant=tenant_a, user=viewer, role=Membership.Role.VIEWER)
    return tenant_a, tenant_b, product_a, product_b, owner, viewer


def payload(product_id):
    return {
        "full_name": "Cliente sintético",
        "company_name": "Negocio de prueba",
        "email": "cliente@example.test",
        "phone": "",
        "message": "Solicito información.",
        "items": [{"product": str(product_id), "quantity": 3}],
        "consent": True,
        "website": "",
    }


def authenticated_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_public_visitor_creates_tenant_bound_quote_request(inquiry_context):
    tenant_a, _, product_a, _, _, _ = inquiry_context
    response = APIClient().post(
        reverse("public-quote-request"),
        payload(product_a.id),
        format="json",
        HTTP_HOST="inquiry-a.localhost",
    )

    assert response.status_code == 201
    quote_request = QuoteRequest.objects.get()
    assert quote_request.tenant == tenant_a
    assert quote_request.status == QuoteRequest.Status.NEW
    assert quote_request.consent_at is not None
    item = quote_request.items.get()
    assert item.product == product_a
    assert item.product_name == "Café"
    assert item.product_sku == "CAFE-1"
    assert item.quantity == 3


@pytest.mark.django_db
def test_public_request_rejects_product_from_another_tenant(inquiry_context):
    _, _, _, product_b, _, _ = inquiry_context
    response = APIClient().post(
        reverse("public-quote-request"),
        payload(product_b.id),
        format="json",
        HTTP_HOST="inquiry-a.localhost",
    )

    assert response.status_code == 400
    assert QuoteRequest.objects.count() == 0


@pytest.mark.django_db
def test_public_request_requires_consent_and_contact_channel(inquiry_context):
    _, _, product_a, _, _, _ = inquiry_context
    data = payload(product_a.id)
    data.update({"email": "", "phone": "", "consent": False})
    response = APIClient().post(
        reverse("public-quote-request"), data, format="json", HTTP_HOST="inquiry-a.localhost"
    )

    assert response.status_code == 400
    assert QuoteRequest.objects.count() == 0


@pytest.mark.django_db
def test_honeypot_rejects_automated_submission(inquiry_context):
    _, _, product_a, _, _, _ = inquiry_context
    data = payload(product_a.id)
    data["website"] = "https://spam.example"
    response = APIClient().post(
        reverse("public-quote-request"), data, format="json", HTTP_HOST="inquiry-a.localhost"
    )

    assert response.status_code == 400
    assert QuoteRequest.objects.count() == 0


@pytest.mark.django_db
def test_private_list_is_isolated_to_current_tenant(inquiry_context):
    tenant_a, tenant_b, _, _, owner, _ = inquiry_context
    QuoteRequest.objects.create(tenant=tenant_a, full_name="Solicitud A", email="a@example.test", consent_at="2026-01-01T00:00:00Z")
    QuoteRequest.objects.create(tenant=tenant_b, full_name="Solicitud B", email="b@example.test", consent_at="2026-01-01T00:00:00Z")

    response = authenticated_client(owner).get(reverse("quote-request-list"), HTTP_HOST="inquiry-a.localhost")

    assert response.status_code == 200
    assert [item["full_name"] for item in response.json()] == ["Solicitud A"]


@pytest.mark.django_db
def test_owner_can_update_status_but_viewer_cannot(inquiry_context):
    tenant_a, _, _, _, owner, viewer = inquiry_context
    quote_request = QuoteRequest.objects.create(
        tenant=tenant_a,
        full_name="Solicitud",
        email="client@example.test",
        consent_at="2026-01-01T00:00:00Z",
    )
    url = reverse("quote-request-detail", args=[quote_request.id])

    owner_response = authenticated_client(owner).patch(
        url, {"status": QuoteRequest.Status.CONTACTED}, format="json", HTTP_HOST="inquiry-a.localhost"
    )
    viewer_response = authenticated_client(viewer).patch(
        url, {"status": QuoteRequest.Status.CLOSED}, format="json", HTTP_HOST="inquiry-a.localhost"
    )

    assert owner_response.status_code == 200
    assert viewer_response.status_code == 403
    quote_request.refresh_from_db()
    assert quote_request.status == QuoteRequest.Status.CONTACTED
