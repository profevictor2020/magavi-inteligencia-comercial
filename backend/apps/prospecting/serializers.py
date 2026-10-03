from urllib.parse import urlsplit

from rest_framework import serializers

from .models import Prospect


def normalized_domain(value):
    if not value:
        return ""
    hostname = urlsplit(value if "://" in value else f"https://{value}").hostname or ""
    return hostname.removeprefix("www.").lower()


def normalized_phone(value):
    return "".join(character for character in value if character.isdigit())


class ProspectSerializer(serializers.ModelSerializer):
    duplicate_warnings = serializers.SerializerMethodField()

    class Meta:
        model = Prospect
        fields = (
            "id", "name", "industry", "address", "city", "region", "website", "email", "phone",
            "source", "notes", "verified_at", "status", "duplicate_warnings", "created_at", "updated_at",
        )
        read_only_fields = ("id", "duplicate_warnings", "created_at", "updated_at")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("name", getattr(self.instance, "name", "")).strip():
            raise serializers.ValidationError({"name": "El nombre es obligatorio."})
        if not attrs.get("source", getattr(self.instance, "source", "")).strip():
            raise serializers.ValidationError({"source": "La fuente es obligatoria."})
        return attrs

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
