from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product
from apps.tenancy.models import Membership, Tenant, TenantDomain


@pytest.fixture
def catalog_context(db):
    tenant_a = Tenant.objects.create(
        name="Empresa A",
        slug="catalog-empresa-a",
        headline="Empresa A",
        logo_path="/static/demo/empresa-a.svg",
        featured_offerings=[],
    )
    tenant_b = Tenant.objects.create(
        name="Empresa B",
        slug="catalog-empresa-b",
        headline="Empresa B",
        logo_path="/static/demo/empresa-b.svg",
        featured_offerings=[],
    )
    TenantDomain.objects.create(tenant=tenant_a, hostname="catalog-a.localhost", is_primary=True, is_verified=True)
    TenantDomain.objects.create(tenant=tenant_b, hostname="catalog-b.localhost", is_primary=True, is_verified=True)
    owner = get_user_model().objects.create_user("catalog-owner", "owner@example.test", "password")
    viewer = get_user_model().objects.create_user("catalog-viewer", "viewer@example.test", "password")
    Membership.objects.create(tenant=tenant_a, user=owner, role=Membership.Role.OWNER)
    Membership.objects.create(tenant=tenant_a, user=viewer, role=Membership.Role.VIEWER)
    category_a = Category.objects.create(tenant=tenant_a, name="Abarrotes")
    category_b = Category.objects.create(tenant=tenant_b, name="Insumos")
    return tenant_a, tenant_b, owner, viewer, category_a, category_b


def authenticated_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
def test_owner_creates_product_only_inside_resolved_tenant(catalog_context):
    tenant_a, _, owner, _, category_a, _ = catalog_context
    response = authenticated_client(owner).post(
        reverse("catalog-product-list"),
        {
            "category": str(category_a.id),
            "name": "Café premium",
            "sku": "CAFE-001",
            "format": "Caja 12 unidades",
            "price": "24990.00",
            "is_available": True,
            "is_published": False,
        },
        format="json",
        HTTP_HOST="catalog-a.localhost",
    )

    assert response.status_code == 201
    product = Product.objects.get()
    assert product.tenant == tenant_a
    assert product.price == Decimal("24990.00")
    assert response.json()["category_name"] == "Abarrotes"


@pytest.mark.django_db
def test_catalog_rejects_category_from_another_tenant(catalog_context):
    _, _, owner, _, _, category_b = catalog_context
    response = authenticated_client(owner).post(
        reverse("catalog-product-list"),
        {"category": str(category_b.id), "name": "Producto cruzado", "sku": "CROSS-1"},
        format="json",
        HTTP_HOST="catalog-a.localhost",
    )

    assert response.status_code == 400
    assert Product.objects.count() == 0


@pytest.mark.django_db
def test_catalog_rejects_negative_price(catalog_context):
    _, _, owner, _, category_a, _ = catalog_context
    response = authenticated_client(owner).post(
        reverse("catalog-product-list"),
        {"category": str(category_a.id), "name": "Producto", "sku": "NEG-1", "price": "-1.00"},
        format="json",
        HTTP_HOST="catalog-a.localhost",
    )

    assert response.status_code == 400
    assert "price" in response.json()


@pytest.mark.django_db
def test_catalog_lists_only_current_tenant_products(catalog_context):
    tenant_a, tenant_b, owner, _, category_a, category_b = catalog_context
    Product.objects.create(tenant=tenant_a, category=category_a, name="Producto A", sku="A-1")
    Product.objects.create(tenant=tenant_b, category=category_b, name="Producto B", sku="B-1")

    response = authenticated_client(owner).get(reverse("catalog-product-list"), HTTP_HOST="catalog-a.localhost")

    assert response.status_code == 200
    assert [product["name"] for product in response.json()] == ["Producto A"]


@pytest.mark.django_db
def test_viewer_can_read_but_cannot_modify_catalog(catalog_context):
    _, _, _, viewer, category_a, _ = catalog_context
    product = Product.objects.create(tenant=category_a.tenant, category=category_a, name="Producto", sku="P-1")
    client = authenticated_client(viewer)

    assert client.get(reverse("catalog-product-list"), HTTP_HOST="catalog-a.localhost").status_code == 200
    response = client.patch(
        reverse("catalog-product-detail", args=[product.id]),
        {"is_published": True},
        format="json",
        HTTP_HOST="catalog-a.localhost",
    )
    assert response.status_code == 403
    product.refresh_from_db()
    assert product.is_published is False


@pytest.mark.django_db
def test_public_landing_contains_only_published_available_products(catalog_context):
    tenant_a, _, _, _, category_a, _ = catalog_context
    Product.objects.create(
        tenant=tenant_a,
        category=category_a,
        name="Producto publicado",
        sku="PUB-1",
        price="15990.00",
        is_published=True,
    )
    Product.objects.create(tenant=tenant_a, category=category_a, name="Producto borrador", sku="DRAFT-1")

    response = APIClient().get(reverse("public-landing"), HTTP_HOST="catalog-a.localhost")

    assert response.status_code == 200
    assert [product["name"] for product in response.json()["products"]] == ["Producto publicado"]
    assert response.json()["products"][0]["category"] == "Abarrotes"
