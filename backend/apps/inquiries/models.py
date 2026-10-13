import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils import timezone


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


class Quote(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        ISSUED = "ISSUED", "Emitida"

    class FollowUpStatus(models.TextChoices):
        UNSENT = "UNSENT", "Por enviar"
        SENT = "SENT", "Enviada"
        ACCEPTED = "ACCEPTED", "Aceptada"
        REJECTED = "REJECTED", "Rechazada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.PositiveIntegerField(editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="quotes")
    request = models.OneToOneField(QuoteRequest, on_delete=models.PROTECT, related_name="quote")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    valid_until = models.DateField()
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("19.00"))
    notes = models.TextField(blank=True, max_length=1500)
    issued_at = models.DateTimeField(null=True, blank=True)
    follow_up_status = models.CharField(max_length=8, choices=FollowUpStatus.choices, default=FollowUpStatus.UNSENT)
    next_contact_on = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True, max_length=1500)
    sent_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tenant", "number"], name="unique_quote_number_per_tenant")]

    @property
    def folio(self) -> str:
        return f"COT-{self.number:06d}"

    @property
    def tracking_status(self) -> str:
        if (self.status == self.Status.ISSUED and self.valid_until < timezone.localdate()
                and self.follow_up_status in {self.FollowUpStatus.UNSENT, self.FollowUpStatus.SENT}):
            return "EXPIRED"
        return self.follow_up_status

    @property
    def subtotal(self) -> Decimal:
        return sum((item.line_total for item in self.items.all()), Decimal("0"))

    @property
    def tax_amount(self) -> Decimal:
        return (self.subtotal * self.tax_rate / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    @property
    def total(self) -> Decimal:
        return self.subtotal + self.tax_amount

    def __str__(self) -> str:
        return f"Cotización {self.folio} · {self.tenant}"


class QuoteItem(models.Model):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="items")
    request_item = models.ForeignKey(QuoteRequestItem, on_delete=models.PROTECT, related_name="quote_items")
    product_name = models.CharField(max_length=160)
    product_sku = models.CharField(max_length=80)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    @property
    def line_total(self) -> Decimal:
        return self.unit_price.quantize(Decimal("1"), rounding=ROUND_HALF_UP) * self.quantity

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["quote", "request_item"], name="unique_request_item_per_quote")]
