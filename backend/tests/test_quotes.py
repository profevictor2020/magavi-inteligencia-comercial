from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inquiries.models import Quote, QuoteItem, QuoteRequest, QuoteRequestItem
from apps.inquiries.templatetags.quote_format import clp, percentage_cl
from tests.test_inquiries import authenticated_client, inquiry_context


@pytest.fixture
def quote_context(inquiry_context):
    tenant_a, tenant_b, product_a, product_b, owner, viewer = inquiry_context
    source_a = QuoteRequest.objects.create(tenant=tenant_a, full_name="Cliente A", email="a@example.test", consent_at=timezone.now())
    source_b = QuoteRequest.objects.create(tenant=tenant_b, full_name="Cliente B", email="b@example.test", consent_at=timezone.now())
    item_a = QuoteRequestItem.objects.create(quote_request=source_a, product=product_a, product_name="Café", product_sku="CAFE-1", quantity=3)
    QuoteRequestItem.objects.create(quote_request=source_b, product=product_b, product_name="Té", product_sku="TE-1", quantity=2)
    return source_a, source_b, item_a, owner, viewer


def draft_payload(item_id, price="1000"):
    return {"valid_until": str(timezone.localdate() + timedelta(days=7)), "tax_rate": "19.00", "notes": "Entrega acordada", "items": [{"request_item": item_id, "unit_price": price}]}


@pytest.mark.django_db
def test_quote_draft_totals_snapshot_and_issue(quote_context):
    source, _, item, owner, _ = quote_context
    client = authenticated_client(owner)
    host = "inquiry-a.localhost"
    url = f"/api/inquiries/{source.id}/quote/"
    payload = draft_payload(item.id)
    payload["notes"] = "<script>alert(1)</script>"
    created = client.post(url, payload, format="json", HTTP_HOST=host)
    assert created.status_code == 201
    assert created.data["subtotal"] == "3000"
    assert created.data["folio"] == "COT-000001"
    assert created.data["tax_amount"] == "570"
    assert created.data["total"] == "3570"
    assert created.data["items"][0]["product_name"] == "Café"
    updated_payload = draft_payload(item.id, "2000")
    updated_payload["notes"] = payload["notes"]
    updated = client.patch(url, updated_payload, format="json", HTTP_HOST=host)
    assert updated.status_code == 200
    assert updated.data["total"] == "7140"

    item.product_name = "Nombre cambiado"
    item.quantity = 9
    item.save()
    quote = Quote.objects.get(request=source)
    assert quote.items.get().product_name == "Café"
    assert quote.items.get().quantity == 3

    issued = client.post(url + "issue/", HTTP_HOST=host)
    assert issued.status_code == 200
    assert issued.data["status"] == "ISSUED"
    assert client.patch(url, draft_payload(item.id, "1000"), format="json", HTTP_HOST=host).status_code == 409
    assert Quote.objects.get(request=source).subtotal == Decimal("6000")
    printable = client.get(url + "print/", HTTP_HOST=host)
    assert printable.status_code == 200
    assert b"Cliente A" in printable.content
    assert b"COT-000001" in printable.content
    assert b"$7.140" in printable.content
    assert b"IVA (19%)" in printable.content
    assert b"<script>alert(1)</script>" not in printable.content
    assert printable["Cache-Control"] == "private, no-store"


@pytest.mark.django_db
def test_quote_tenant_and_role_permissions(quote_context):
    source_a, source_b, item, owner, viewer = quote_context
    url_a = f"/api/inquiries/{source_a.id}/quote/"
    url_b = f"/api/inquiries/{source_b.id}/quote/"
    payload = draft_payload(item.id)
    assert APIClient().post(url_a, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code in (401, 403)
    assert authenticated_client(viewer).post(url_a, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code == 403
    assert authenticated_client(owner).post(url_b, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code == 404
    assert authenticated_client(owner).post(url_a, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code == 201
    assert authenticated_client(viewer).get(url_a, HTTP_HOST="inquiry-a.localhost").status_code == 200
    assert authenticated_client(viewer).get(url_a + "print/", HTTP_HOST="inquiry-a.localhost").status_code == 409
    assert authenticated_client(viewer).get(url_b + "print/", HTTP_HOST="inquiry-a.localhost").status_code == 404
    assert authenticated_client(viewer).post(url_a + "issue/", HTTP_HOST="inquiry-a.localhost").status_code == 403


@pytest.mark.django_db
def test_quote_rejects_missing_items_negative_prices_and_duplicates(quote_context):
    source, _, item, owner, _ = quote_context
    url = f"/api/inquiries/{source.id}/quote/"
    client = authenticated_client(owner)
    for payload in (
        draft_payload(item.id, "-1"),
        draft_payload(item.id, "12598.50"),
        {**draft_payload(item.id), "items": []},
        {**draft_payload(item.id), "items": [{"request_item": item.id + 100, "unit_price": "100"}]},
        {**draft_payload(item.id), "items": [draft_payload(item.id)["items"][0]] * 2},
    ):
        assert client.post(url, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code == 400
    assert Quote.objects.count() == 0


@pytest.mark.django_db
def test_quote_numbers_advance_within_tenant(quote_context):
    source, _, item, owner, _ = quote_context
    client = authenticated_client(owner)
    first = client.post(f"/api/inquiries/{source.id}/quote/", draft_payload(item.id), format="json", HTTP_HOST="inquiry-a.localhost")
    second_source = QuoteRequest.objects.create(tenant=source.tenant, full_name="Otro cliente", email="otro@example.test", consent_at=timezone.now())
    second_item = QuoteRequestItem.objects.create(quote_request=second_source, product=item.product, product_name="Café", product_sku="CAFE-1", quantity=1)
    second = client.post(f"/api/inquiries/{second_source.id}/quote/", draft_payload(second_item.id), format="json", HTTP_HOST="inquiry-a.localhost")
    assert first.data["folio"] == "COT-000001"
    assert second.data["folio"] == "COT-000002"


def test_chilean_money_format_uses_whole_pesos():
    assert clp(Decimal("24990.00")) == "$24.990"
    assert clp(Decimal("895820.10")) == "$895.820"
    assert clp(Decimal("895820.50")) == "$895.821"
    assert percentage_cl(Decimal("19.00")) == "19"
    assert percentage_cl(Decimal("7.50")) == "7,5"


@pytest.mark.django_db
def test_quote_rounds_iva_to_whole_peso(quote_context):
    source, _, item, owner, _ = quote_context
    response = authenticated_client(owner).post(
        f"/api/inquiries/{source.id}/quote/", draft_payload(item.id, "999"),
        format="json", HTTP_HOST="inquiry-a.localhost",
    )
    assert response.status_code == 201
    assert response.data["subtotal"] == "2997"
    assert response.data["tax_amount"] == "569"
    assert response.data["total"] == "3566"


@pytest.mark.django_db
def test_existing_quote_with_cents_displays_consistent_whole_pesos(quote_context):
    source, _, item, owner, _ = quote_context
    quote = Quote.objects.create(tenant=source.tenant, request=source, number=1, status=Quote.Status.ISSUED,
                                 issued_at=timezone.now(), valid_until=timezone.localdate() + timedelta(days=7))
    QuoteItem.objects.create(quote=quote, request_item=item, product_name=item.product_name,
                             product_sku=item.product_sku, quantity=item.quantity, unit_price=Decimal("12598.50"))
    client = authenticated_client(owner)
    url = f"/api/inquiries/{source.id}/quote/"
    response = client.get(url, HTTP_HOST="inquiry-a.localhost")
    assert response.data["items"][0]["unit_price"] == "12599"
    assert response.data["items"][0]["line_total"] == "37797"
    assert response.data["subtotal"] == "37797"
    assert response.data["tax_amount"] == "7181"
    assert response.data["total"] == "44978"
    printable = client.get(url + "print/", HTTP_HOST="inquiry-a.localhost")
    assert b"$12.599" in printable.content
    assert b"$44.978" in printable.content
    assert b",50" not in printable.content
