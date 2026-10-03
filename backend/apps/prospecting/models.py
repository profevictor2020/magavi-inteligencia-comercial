import uuid

from django.db import models


class Prospect(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "Nuevo"
        REVIEWED = "REVIEWED", "Revisado"
        DISCARDED = "DISCARDED", "Descartado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="prospects")
    name = models.CharField(max_length=180)
    industry = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=240, blank=True)
    city = models.CharField(max_length=120, blank=True)
    region = models.CharField(max_length=120, blank=True)
    website = models.URLField(blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    source = models.CharField(max_length=240)
    notes = models.TextField(blank=True, max_length=2000)
    verified_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        indexes = [models.Index(fields=["tenant", "status", "name"], name="prospect_tenant_status_idx")]

    def __str__(self):
        return f"{self.name} · {self.tenant}"
