from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inquiries.models import Quote, QuoteRequest, QuoteRequestItem
from tests.test_inquiries import authenticated_client, inquiry_context


@pytest.fixture
def quote_context(inquiry_context):
    tenant_a, tenant_b, product_a, product_b, owner, viewer = inquiry_context
    source_a = QuoteRequest.objects.create(tenant=tenant_a, full_name="Cliente A", email="a@example.test", consent_at=timezone.now())
    source_b = QuoteRequest.objects.create(tenant=tenant_b, full_name="Cliente B", email="b@example.test", consent_at=timezone.now())
    item_a = QuoteRequestItem.objects.create(quote_request=source_a, product=product_a, product_name="Café", product_sku="CAFE-1", quantity=3)
    QuoteRequestItem.objects.create(quote_request=source_b, product=product_b, product_name="Té", product_sku="TE-1", quantity=2)
    return source_a, source_b, item_a, owner, viewer


def draft_payload(item_id, price="1000.00"):
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
    assert created.data["subtotal"] == "3000.00"
    assert created.data["tax_amount"] == "570.00"
    assert created.data["total"] == "3570.00"
    assert created.data["items"][0]["product_name"] == "Café"
    updated_payload = draft_payload(item.id, "2000.00")
    updated_payload["notes"] = payload["notes"]
    updated = client.patch(url, updated_payload, format="json", HTTP_HOST=host)
    assert updated.status_code == 200
    assert updated.data["total"] == "7140.00"

    item.product_name = "Nombre cambiado"
    item.quantity = 9
    item.save()
    quote = Quote.objects.get(request=source)
    assert quote.items.get().product_name == "Café"
    assert quote.items.get().quantity == 3

    issued = client.post(url + "issue/", HTTP_HOST=host)
    assert issued.status_code == 200
    assert issued.data["status"] == "ISSUED"
    assert client.patch(url, draft_payload(item.id, "1000.00"), format="json", HTTP_HOST=host).status_code == 409
    assert Quote.objects.get(request=source).subtotal == Decimal("6000.00")
    printable = client.get(url + "print/", HTTP_HOST=host)
    assert printable.status_code == 200
    assert b"Cliente A" in printable.content
    assert b"7140,00" in printable.content or b"7140.00" in printable.content
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
        draft_payload(item.id, "-1.00"),
        {**draft_payload(item.id), "items": []},
        {**draft_payload(item.id), "items": [{"request_item": item.id + 100, "unit_price": "100.00"}]},
        {**draft_payload(item.id), "items": [draft_payload(item.id)["items"][0]] * 2},
    ):
        assert client.post(url, payload, format="json", HTTP_HOST="inquiry-a.localhost").status_code == 400
    assert Quote.objects.count() == 0
