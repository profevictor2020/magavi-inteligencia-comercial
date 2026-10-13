from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Product

from .models import Quote, QuoteItem, QuoteRequest, QuoteRequestItem


class PublicQuoteItemSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=100_000)


class PublicQuoteRequestSerializer(serializers.ModelSerializer):
    items = PublicQuoteItemSerializer(many=True, allow_empty=False, write_only=True)
    consent = serializers.BooleanField(write_only=True)
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = QuoteRequest
        fields = ("id", "full_name", "company_name", "email", "phone", "message", "items", "consent", "website")
        read_only_fields = ("id",)

    def validate(self, attrs):
        if attrs.pop("website", ""):
            raise serializers.ValidationError("No fue posible enviar la solicitud.")
        if not attrs.pop("consent"):
            raise serializers.ValidationError({"consent": "Debes aceptar el contacto comercial."})
        if not attrs.get("email") and not attrs.get("phone"):
            raise serializers.ValidationError("Ingresa un correo electrónico o teléfono.")
        product_ids = [item["product"] for item in attrs["items"]]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError({"items": "Cada producto puede aparecer una sola vez."})
        tenant = self.context["request"].tenant
        products = Product.objects.filter(
            id__in=product_ids,
            tenant=tenant,
            category__is_active=True,
            is_available=True,
            is_published=True,
        )
        if products.count() != len(product_ids):
            raise serializers.ValidationError({"items": "Uno o más productos no están disponibles."})
        attrs["resolved_products"] = {product.id: product for product in products}
        return attrs

    def create(self, validated_data):
        items = validated_data.pop("items")
        products = validated_data.pop("resolved_products")
        tenant = self.context["request"].tenant
        with transaction.atomic():
            quote_request = QuoteRequest.objects.create(tenant=tenant, consent_at=timezone.now(), **validated_data)
            QuoteRequestItem.objects.bulk_create(
                [
                    QuoteRequestItem(
                        quote_request=quote_request,
                        product=products[item["product"]],
                        product_name=products[item["product"]].name,
                        product_sku=products[item["product"]].sku,
                        quantity=item["quantity"],
                    )
                    for item in items
                ]
            )
        return quote_request


class PrivateQuoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuoteRequestItem
        fields = ("id", "product", "product_name", "product_sku", "quantity")


class PrivateQuoteRequestSerializer(serializers.ModelSerializer):
    items = PrivateQuoteItemSerializer(many=True, read_only=True)
    quote = serializers.SerializerMethodField()

    def get_quote(self, obj):
        quote = getattr(obj, "quote", None)
        return QuoteSerializer(quote).data if quote else None

    class Meta:
        model = QuoteRequest
        fields = (
            "id",
            "full_name",
            "company_name",
            "email",
            "phone",
            "message",
            "status",
            "items",
            "quote",
            "consent_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "full_name",
            "company_name",
            "email",
            "phone",
            "message",
            "items",
            "quote",
            "consent_at",
            "created_at",
            "updated_at",
        )


class QuoteItemSerializer(serializers.ModelSerializer):
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=0, read_only=True, rounding=ROUND_HALF_UP)
    line_total = serializers.DecimalField(max_digits=22, decimal_places=0, read_only=True)

    class Meta:
        model = QuoteItem
        fields = ("request_item", "product_name", "product_sku", "quantity", "unit_price", "line_total")

class QuoteSerializer(serializers.ModelSerializer):
    items = QuoteItemSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(max_digits=22, decimal_places=0, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=22, decimal_places=0, read_only=True)
    total = serializers.DecimalField(max_digits=22, decimal_places=0, read_only=True)

    class Meta:
        model = Quote
        fields = ("id", "folio", "status", "valid_until", "tax_rate", "notes", "issued_at", "items", "subtotal", "tax_amount", "total", "created_at")


class QuoteDraftItemSerializer(serializers.Serializer):
    request_item = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal("0"), error_messages={"max_decimal_places": "Ingresa el precio en pesos enteros, sin centavos."})


class QuoteDraftSerializer(serializers.Serializer):
    valid_until = serializers.DateField()
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"), default=Decimal("19.00"))
    notes = serializers.CharField(max_length=1500, required=False, allow_blank=True)
    items = QuoteDraftItemSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        if attrs["valid_until"] < timezone.localdate():
            raise serializers.ValidationError({"valid_until": "La vigencia no puede haber terminado."})
        requested = list(self.context["quote_request"].items.all())
        ids = [item["request_item"] for item in attrs["items"]]
        if len(ids) != len(set(ids)) or set(ids) != {item.id for item in requested}:
            raise serializers.ValidationError({"items": "Incluye cada producto solicitado exactamente una vez."})
        attrs["source_items"] = {item.id: item for item in requested}
        return attrs
