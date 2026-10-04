import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.catalog.models import Category, IndustrySegment, Product
from apps.prospecting.models import Opportunity, Prospect, Territory
from apps.tenancy.models import Membership, Tenant, TenantDomain


@pytest.fixture
def prospects(db):
    a = Tenant.objects.create(name="Empresa A", slug="prospect-a", headline="A", logo_path="/a.svg")
    b = Tenant.objects.create(name="Empresa B", slug="prospect-b", headline="B", logo_path="/b.svg")
    TenantDomain.objects.create(tenant=a, hostname="prospect-a.localhost", is_primary=True, is_verified=True)
    TenantDomain.objects.create(tenant=b, hostname="prospect-b.localhost", is_primary=True, is_verified=True)
    owner = get_user_model().objects.create_user("owner-p", "owner-p@example.test", "password")
    viewer = get_user_model().objects.create_user("viewer-p", "viewer-p@example.test", "password")
    Membership.objects.create(tenant=a, user=owner, role=Membership.Role.OWNER)
    Membership.objects.create(tenant=a, user=viewer, role=Membership.Role.VIEWER)
    return a, b, owner, viewer


def client(user):
    result = APIClient()
    result.force_authenticate(user)
    return result


def data(name="Restaurante Bahía"):
    return {"name": name, "industry": IndustrySegment.FOOD_SERVICE, "city": "Viña del Mar", "source": "Visita en terreno", "email": "contacto@bahia.example", "status": "NEW"}


@pytest.mark.django_db
def test_owner_creates_tenant_bound_prospect(prospects):
    tenant, _, owner, _ = prospects
    response = client(owner).post(reverse("prospect-list"), data(), format="json", HTTP_HOST="prospect-a.localhost")
    assert response.status_code == 201
    assert Prospect.objects.get().tenant == tenant


@pytest.mark.django_db
def test_prospect_rejects_free_text_industry_variants(prospects):
    _, _, owner, _ = prospects
    response = client(owner).post(
        reverse("prospect-list"), {**data(), "industry": "Restaurant"}, format="json", HTTP_HOST="prospect-a.localhost"
    )
    assert response.status_code == 400
    assert not Prospect.objects.exists()


@pytest.mark.django_db
def test_list_and_detail_are_isolated_by_tenant(prospects):
    a, b, owner, _ = prospects
    visible = Prospect.objects.create(tenant=a, **data("Visible"))
    hidden = Prospect.objects.create(tenant=b, **data("Oculto"))
    api = client(owner)
    response = api.get(reverse("prospect-list"), HTTP_HOST="prospect-a.localhost")
    assert [row["name"] for row in response.json()] == ["Visible"]
    assert api.get(reverse("prospect-detail", args=[hidden.id]), HTTP_HOST="prospect-a.localhost").status_code == 404
    assert api.get(reverse("prospect-detail", args=[visible.id]), HTTP_HOST="prospect-a.localhost").status_code == 200


@pytest.mark.django_db
def test_viewer_cannot_write(prospects):
    _, _, _, viewer = prospects
    response = client(viewer).post(reverse("prospect-list"), data(), format="json", HTTP_HOST="prospect-a.localhost")
    assert response.status_code == 403


@pytest.mark.django_db
def test_filters_and_duplicate_warning(prospects):
    a, _, owner, _ = prospects
    Prospect.objects.create(tenant=a, **data("Restaurante Bahía"))
    Prospect.objects.create(tenant=a, **{**data("Hotel Central"), "industry": IndustrySegment.HOSPITALITY, "status": "REVIEWED", "email": "hotel@example.test"})
    api = client(owner)
    filtered = api.get(reverse("prospect-list") + f"?status=REVIEWED&industry={IndustrySegment.HOSPITALITY}", HTTP_HOST="prospect-a.localhost")
    assert [row["name"] for row in filtered.json()] == ["Hotel Central"]
    duplicate = api.post(reverse("prospect-list"), {**data("Otra razón social"), "website": "https://bahia.example", "email": "contacto@bahia.example"}, format="json", HTTP_HOST="prospect-a.localhost")
    assert duplicate.status_code == 201
    assert duplicate.json()["duplicate_warnings"][0]["matches"] == ["correo"]


@pytest.mark.django_db
def test_owner_manages_territories_with_coverage(prospects):
    tenant, _, owner, _ = prospects
    api = client(owner)
    response = api.post(
        reverse("territory-list"),
        {"name": "Costa Valparaíso", "region": "Valparaíso", "localities": ["Viña del Mar", "Concón"], "prospect_goal": 4},
        format="json",
        HTTP_HOST="prospect-a.localhost",
    )
    assert response.status_code == 201
    territory = Territory.objects.get()
    Prospect.objects.create(tenant=tenant, territory=territory, **{**data("Prospecto revisado"), "status": Prospect.Status.REVIEWED})
    Prospect.objects.create(tenant=tenant, territory=territory, **data("Prospecto nuevo"))

    result = api.get(reverse("territory-list"), HTTP_HOST="prospect-a.localhost").json()[0]
    assert result["prospect_count"] == 2
    assert result["reviewed_count"] == 1
    assert result["coverage_percentage"] == 50


@pytest.mark.django_db
def test_territory_assignment_is_tenant_isolated(prospects):
    tenant_a, tenant_b, owner, _ = prospects
    foreign = Territory.objects.create(tenant=tenant_b, name="Territorio B")
    response = client(owner).post(
        reverse("prospect-list"),
        {**data(), "territory": str(foreign.id)},
        format="json",
        HTTP_HOST="prospect-a.localhost",
    )
    assert response.status_code == 400
    assert not Prospect.objects.filter(tenant=tenant_a).exists()


@pytest.mark.django_db
def test_generates_explainable_tenant_bound_opportunities(prospects):
    tenant, other_tenant, owner, _ = prospects
    territory = Territory.objects.create(tenant=tenant, name="Costa")
    prospect = Prospect.objects.create(tenant=tenant, territory=territory, **data())
    category = Category.objects.create(tenant=tenant, name="Congelados")
    matching_product = Product.objects.create(
        tenant=tenant,
        category=category,
        name="Salmón porcionado",
        sku="SALMON-1",
        target_industries=[IndustrySegment.FOOD_SERVICE],
        match_keywords=["bahía", "mariscos"],
        commercial_priority=Product.CommercialPriority.HIGH,
    )
    Product.objects.create(
        tenant=tenant, category=category, name="Producto irrelevante", sku="OTHER-1", target_industries=[IndustrySegment.CONSTRUCTION]
    )
    foreign_category = Category.objects.create(tenant=other_tenant, name="Categoría B")
    Product.objects.create(
        tenant=other_tenant, category=foreign_category, name="Producto B", sku="B-1", target_industries=[IndustrySegment.FOOD_SERVICE]
    )

    api = client(owner)
    generated = api.post(reverse("opportunity-generate"), format="json", HTTP_HOST="prospect-a.localhost")
    assert generated.status_code == 200
    assert generated.json() == {"created": 1, "updated": 0, "removed": 0, "total": 1}

    opportunity = Opportunity.objects.get()
    assert opportunity.tenant == tenant
    assert opportunity.prospect == prospect
    assert opportunity.product == matching_product
    assert opportunity.score == 77
    assert opportunity.score_breakdown == {
        "industry": 35, "keywords": 12, "territory": 15, "contact": 10, "data_quality": 0, "priority": 5,
    }
    assert "rubro Restaurantes, restobares y cafeterías" in opportunity.explanation
    assert "bahía" in opportunity.explanation


@pytest.mark.django_db
def test_opportunity_review_filters_and_permissions(prospects):
    tenant, _, owner, viewer = prospects
    category = Category.objects.create(tenant=tenant, name="Congelados")
    product = Product.objects.create(
        tenant=tenant, category=category, name="Producto", sku="P-1", target_industries=[IndustrySegment.FOOD_SERVICE]
    )
    prospect = Prospect.objects.create(tenant=tenant, **data())
    opportunity = Opportunity.objects.create(
        tenant=tenant, prospect=prospect, product=product, score=70, explanation="Coincidencia de prueba."
    )
    owner_api = client(owner)

    missing_reason = owner_api.patch(
        reverse("opportunity-detail", args=[opportunity.id]), {"status": "DISCARDED"}, format="json", HTTP_HOST="prospect-a.localhost"
    )
    assert missing_reason.status_code == 400
    reviewed = owner_api.patch(
        reverse("opportunity-detail", args=[opportunity.id]),
        {"status": "DISCARDED", "review_reason": "No trabaja esta línea."},
        format="json",
        HTTP_HOST="prospect-a.localhost",
    )
    assert reviewed.status_code == 200
    assert owner_api.get(
        reverse("opportunity-list") + "?status=DISCARDED&minimum_score=60", HTTP_HOST="prospect-a.localhost"
    ).json()[0]["product_name"] == "Producto"
    assert client(viewer).post(
        reverse("opportunity-generate"), format="json", HTTP_HOST="prospect-a.localhost"
    ).status_code == 403
