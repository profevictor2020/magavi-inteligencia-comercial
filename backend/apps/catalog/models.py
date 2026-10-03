import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="catalog_categories")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, max_length=500)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="unique_catalog_category_name_per_tenant"),
        ]

    def __str__(self) -> str:
        return f"{self.name} · {self.tenant}"


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="catalog_products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, max_length=1000)
    sku = models.CharField(max_length=80)
    format = models.CharField(max_length=120, blank=True)
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    is_available = models.BooleanField(default=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "sku"], name="unique_catalog_product_sku_per_tenant"),
        ]

    def clean(self) -> None:
        super().clean()
        if self.category_id and self.tenant_id and self.category.tenant_id != self.tenant_id:
            from django.core.exceptions import ValidationError

            raise ValidationError({"category": "La categoría debe pertenecer a la misma empresa."})

    def __str__(self) -> str:
        return f"{self.name} ({self.sku})"
