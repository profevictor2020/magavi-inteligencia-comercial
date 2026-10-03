from rest_framework import serializers

from apps.catalog.models import Product
from apps.catalog.serializers import PublicProductSerializer

from .models import Tenant


class PublicTenantLandingSerializer(serializers.ModelSerializer):
    theme = serializers.SerializerMethodField()
    contact = serializers.SerializerMethodField()
    is_demo = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            "name",
            "description",
            "headline",
            "logo_path",
            "theme",
            "contact",
            "featured_offerings",
            "products",
            "is_demo",
        )

    def get_theme(self, obj):
        return {"primary": obj.primary_color, "secondary": obj.secondary_color}

    def get_contact(self, obj):
        return {"email": obj.contact_email, "phone": obj.contact_phone}

    def get_is_demo(self, obj):
        return False

    def get_products(self, obj):
        products = Product.objects.filter(
            tenant=obj,
            category__is_active=True,
            is_available=True,
            is_published=True,
        ).select_related("category")
        return PublicProductSerializer(products, many=True).data


class TenantPrivateSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "headline",
            "logo_path",
            "primary_color",
            "secondary_color",
            "contact_email",
            "contact_phone",
            "featured_offerings",
            "role",
        )
        read_only_fields = ("id", "slug", "name", "logo_path", "role")

    def get_role(self, obj):
        membership = getattr(self.context["request"], "_tenant_membership", None)
        return membership.role if membership else None
