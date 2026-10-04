from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "description", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "category",
            "category_name",
            "name",
            "description",
            "sku",
            "format",
            "price",
            "is_available",
            "is_published",
            "target_industries",
            "match_keywords",
            "commercial_priority",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "category_name", "created_at", "updated_at")

    def validate_target_industries(self, value):
        return self._validate_string_list(value, "Las industrias objetivo")

    def validate_match_keywords(self, value):
        return self._validate_string_list(value, "Las palabras clave")

    @staticmethod
    def _validate_string_list(value, label):
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            raise serializers.ValidationError(f"{label} deben ser una lista de textos.")
        return list(dict.fromkeys(item.strip() for item in value if item.strip()))

    def validate_category(self, category):
        tenant = self.context["request"].tenant
        if category.tenant_id != tenant.id:
            raise serializers.ValidationError("La categoría debe pertenecer a la empresa actual.")
        return category


class PublicProductSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source="category.name")
    price = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=True)

    class Meta:
        model = Product
        fields = ("id", "name", "description", "sku", "format", "price", "category")
