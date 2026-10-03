from urllib.parse import urlsplit

from rest_framework import serializers

from .models import Prospect, Territory


def normalized_domain(value):
    if not value:
        return ""
    hostname = urlsplit(value if "://" in value else f"https://{value}").hostname or ""
    return hostname.removeprefix("www.").lower()


def normalized_phone(value):
    return "".join(character for character in value if character.isdigit())


class TerritorySerializer(serializers.ModelSerializer):
    prospect_count = serializers.IntegerField(read_only=True, default=0)
    reviewed_count = serializers.IntegerField(read_only=True, default=0)
    coverage_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Territory
        fields = (
            "id", "name", "description", "region", "localities", "prospect_goal", "is_active",
            "prospect_count", "reviewed_count", "coverage_percentage", "created_at", "updated_at",
        )
        read_only_fields = ("id", "prospect_count", "reviewed_count", "coverage_percentage", "created_at", "updated_at")

    def validate_localities(self, value):
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise serializers.ValidationError("Las localidades deben ser una lista de textos.")
        return [item.strip() for item in value if item.strip()]

    def get_coverage_percentage(self, territory):
        if not territory.prospect_goal:
            return 0
        return min(100, round(getattr(territory, "prospect_count", 0) * 100 / territory.prospect_goal))


class ProspectSerializer(serializers.ModelSerializer):
    duplicate_warnings = serializers.SerializerMethodField()
    territory_name = serializers.CharField(source="territory.name", read_only=True)

    class Meta:
        model = Prospect
        fields = (
            "id", "territory", "territory_name", "name", "industry", "address", "city", "region", "website", "email", "phone",
            "source", "notes", "verified_at", "status", "duplicate_warnings", "created_at", "updated_at",
        )
        read_only_fields = ("id", "territory_name", "duplicate_warnings", "created_at", "updated_at")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("name", getattr(self.instance, "name", "")).strip():
            raise serializers.ValidationError({"name": "El nombre es obligatorio."})
        if not attrs.get("source", getattr(self.instance, "source", "")).strip():
            raise serializers.ValidationError({"source": "La fuente es obligatoria."})
        return attrs

    def validate_territory(self, territory):
        if territory and territory.tenant_id != self.context["request"].tenant.id:
            raise serializers.ValidationError("El territorio debe pertenecer a la empresa actual.")
        return territory

    def get_duplicate_warnings(self, prospect):
        tenant = self.context["request"].tenant
        matches = Prospect.objects.filter(tenant=tenant).exclude(pk=prospect.pk)
        domain = normalized_domain(prospect.website)
        phone = normalized_phone(prospect.phone)
        warnings = []
        for candidate in matches:
            reasons = []
            if candidate.name.casefold().strip() == prospect.name.casefold().strip():
                reasons.append("nombre")
            if domain and normalized_domain(candidate.website) == domain:
                reasons.append("sitio web")
            if phone and normalized_phone(candidate.phone) == phone:
                reasons.append("teléfono")
            if prospect.email and candidate.email.casefold().strip() == prospect.email.casefold().strip():
                reasons.append("correo")
            if reasons:
                warnings.append({"id": str(candidate.id), "name": candidate.name, "matches": reasons})
        return warnings
