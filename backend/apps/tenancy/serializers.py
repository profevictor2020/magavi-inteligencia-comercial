from rest_framework import serializers

from .models import Tenant


class PublicTenantLandingSerializer(serializers.ModelSerializer):
    theme = serializers.SerializerMethodField()
    contact = serializers.SerializerMethodField()
    is_demo = serializers.SerializerMethodField()

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
            "is_demo",
        )

    def get_theme(self, obj):
        return {"primary": obj.primary_color, "secondary": obj.secondary_color}

    def get_contact(self, obj):
        return {"email": obj.contact_email, "phone": obj.contact_phone}

    def get_is_demo(self, obj):
        return False


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
