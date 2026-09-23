import uuid

from django.db import models


class QuoteRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "Nueva"
        CONTACTED = "CONTACTED", "Contactada"
        CLOSED = "CLOSED", "Cerrada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="quote_requests")
    full_name = models.CharField(max_length=160)
    company_name = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    message = models.TextField(blank=True, max_length=1500)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    consent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["tenant", "status", "-created_at"], name="inquiry_tenant_status_idx")]

    def __str__(self) -> str:
        return f"{self.full_name} · {self.tenant}"


class QuoteRequestItem(models.Model):
    quote_request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="quote_request_items")
    product_name = models.CharField(max_length=160)
    product_sku = models.CharField(max_length=80)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["quote_request", "product"], name="unique_product_per_quote_request"),
        ]

    def __str__(self) -> str:
        return f"{self.product_name} × {self.quantity}"
