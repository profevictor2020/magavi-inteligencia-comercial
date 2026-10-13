from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Product
from apps.tenancy.models import Tenant

from .models import PurchaseOrder, PurchaseOrderItem, Quote, QuoteItem, QuoteRequest, QuoteRequestItem


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


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    unit_price = serializers.IntegerField(read_only=True)
    line_total = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ("product_name", "product_sku", "quantity", "unit_price", "line_total")


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    total = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ("id", "folio", "full_name", "company_name", "email", "phone", "delivery_method", "delivery_address", "notes", "status", "source_request", "items", "total", "created_at")


class PublicPurchaseItemSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=100_000)


class PublicPurchaseOrderSerializer(serializers.ModelSerializer):
    items = PublicPurchaseItemSerializer(many=True, allow_empty=False, write_only=True)
    consent = serializers.BooleanField(write_only=True)
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)
    total = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ("id", "folio", "full_name", "company_name", "email", "phone", "delivery_method", "delivery_address", "notes", "items", "consent", "website", "total")
        read_only_fields = ("id", "folio", "total")

    def validate(self, attrs):
        if attrs.pop("website", ""):
            raise serializers.ValidationError("No fue posible enviar el pedido.")
        if not attrs.pop("consent"):
            raise serializers.ValidationError({"consent": "Debes autorizar el contacto para coordinar el pedido."})
        if not attrs.get("email") and not attrs.get("phone"):
            raise serializers.ValidationError("Ingresa un correo electrónico o teléfono.")
        if attrs["delivery_method"] == PurchaseOrder.DeliveryMethod.SHIPPING and not attrs.get("delivery_address", "").strip():
            raise serializers.ValidationError({"delivery_address": "Ingresa la dirección de despacho."})
        if attrs["delivery_method"] != PurchaseOrder.DeliveryMethod.SHIPPING:
            attrs["delivery_address"] = ""
        if len(attrs["items"]) > 50:
            raise serializers.ValidationError({"items": "Puedes incluir hasta 50 productos por pedido."})
        product_ids = [item["product"] for item in attrs["items"]]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError({"items": "Cada producto puede aparecer una sola vez."})
        return attrs

    def create(self, validated_data):
        items = validated_data.pop("items")
        tenant = self.context["request"].tenant
        with transaction.atomic():
            Tenant.objects.select_for_update().get(pk=tenant.pk)
            products = Product.objects.select_for_update().filter(
                id__in=[item["product"] for item in items], tenant=tenant,
                category__is_active=True, is_available=True, is_published=True,
            )
            resolved = {product.id: product for product in products}
            if len(resolved) != len(items):
                raise serializers.ValidationError({"items": "Uno o más productos no están disponibles."})
            for product in resolved.values():
                if product.price is None or product.price <= 0 or product.price != product.price.to_integral_value():
                    raise serializers.ValidationError({"items": "Un producto no tiene precio de compra en pesos enteros. Solicita una cotización."})
            last_number = PurchaseOrder.objects.filter(tenant=tenant).aggregate(Max("number"))["number__max"] or 0
            order = PurchaseOrder.objects.create(
                tenant=tenant, number=last_number + 1, consent_at=timezone.now(), **validated_data,
            )
            PurchaseOrderItem.objects.bulk_create([
                PurchaseOrderItem(
                    order=order, product=resolved[item["product"]],
                    product_name=resolved[item["product"]].name,
                    product_sku=resolved[item["product"]].sku,
                    quantity=item["quantity"], unit_price=resolved[item["product"]].price,
                ) for item in items
            ])
        return order


class PurchaseOrderStatusSerializer(serializers.ModelSerializer):
    source_request = serializers.PrimaryKeyRelatedField(queryset=QuoteRequest.objects.none(), allow_null=True, required=False)

    class Meta:
        model = PurchaseOrder
        fields = ("status", "source_request")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.tenant:
            self.fields["source_request"].queryset = QuoteRequest.objects.filter(tenant=request.tenant)

    def validate_source_request(self, value):
        if value is None:
            return value
        order = self.instance
        if value.created_at > order.created_at:
            raise serializers.ValidationError("La solicitud debe ser anterior al pedido.")
        same_email = bool(order.email and value.email and order.email.strip().casefold() == value.email.strip().casefold())
        order_phone = "".join(character for character in order.phone if character.isdigit())
        request_phone = "".join(character for character in value.phone if character.isdigit())
        same_phone = len(order_phone) >= 9 and len(request_phone) >= 9 and order_phone[-9:] == request_phone[-9:]
        if not (same_email or same_phone):
            raise serializers.ValidationError("El correo o teléfono del pedido debe coincidir con la solicitud.")
        return value

    def validate_status(self, value):
        current = self.instance.status
        allowed = {
            PurchaseOrder.Status.NEW: {PurchaseOrder.Status.CONFIRMED, PurchaseOrder.Status.CANCELLED},
            PurchaseOrder.Status.CONFIRMED: {PurchaseOrder.Status.COMPLETED, PurchaseOrder.Status.CANCELLED},
        }
        if value != current and value not in allowed.get(current, set()):
            raise serializers.ValidationError("Este cambio de estado no está permitido.")
        return value


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
    tracking_status = serializers.CharField(read_only=True)

    class Meta:
        model = Quote
        fields = ("id", "folio", "status", "valid_until", "tax_rate", "notes", "issued_at", "items", "subtotal", "tax_amount", "total", "follow_up_status", "tracking_status", "next_contact_on", "follow_up_notes", "sent_at", "responded_at", "created_at")


class QuoteFollowUpSerializer(serializers.Serializer):
    follow_up_status = serializers.ChoiceField(choices=Quote.FollowUpStatus.choices, required=False)
    next_contact_on = serializers.DateField(required=False, allow_null=True)
    follow_up_notes = serializers.CharField(max_length=1500, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Indica al menos un dato de seguimiento.")
        return attrs


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
