import uuid

from django.db import models
from django.db.models import Q

from apps.catalog.models import IndustrySegment


class Territory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="territories")
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, max_length=800)
    region = models.CharField(max_length=120, blank=True)
    localities = models.JSONField(default=list, blank=True)
    prospect_goal = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="unique_territory_name_per_tenant"),
        ]

    def __str__(self):
        return f"{self.name} · {self.tenant}"


class Prospect(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "Nuevo"
        REVIEWED = "REVIEWED", "Revisado"
        DISCARDED = "DISCARDED", "Descartado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="prospects")
    territory = models.ForeignKey(
        Territory, null=True, blank=True, on_delete=models.SET_NULL, related_name="prospects"
    )
    name = models.CharField(max_length=180)
    industry = models.CharField(max_length=32, choices=IndustrySegment.choices, blank=True)
    address = models.CharField(max_length=240, blank=True)
    city = models.CharField(max_length=120, blank=True)
    region = models.CharField(max_length=120, blank=True)
    website = models.URLField(blank=True)
    instagram_handle = models.CharField(max_length=30, blank=True, editable=False)
    discovery_score = models.PositiveSmallIntegerField(null=True, blank=True, editable=False)
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
        constraints = [models.UniqueConstraint(fields=["tenant", "instagram_handle"], condition=~Q(instagram_handle=""), name="unique_instagram_handle_per_tenant")]

    def __str__(self):
        return f"{self.name} · {self.tenant}"


class DiscoveryRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = "RUNNING", "En curso"
        PENDING = "PENDING", "Esperando resultados"
        COMPLETED = "COMPLETED", "Completada"
        FAILED = "FAILED", "Fallida"
        SKIPPED = "SKIPPED", "Sin objetivos"

    tenant = models.OneToOneField("tenancy.Tenant", on_delete=models.CASCADE, related_name="discovery_run")
    enabled = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SKIPPED)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    hashtags = models.JSONField(default=list, blank=True)
    profiles_found = models.PositiveIntegerField(default=0)
    prospects_created = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=250, blank=True)
    mindcase_job_id = models.CharField(max_length=100, blank=True)
    mindcase_submission_attempted = models.BooleanField(default=False)
    mindcase_submitted_at = models.DateTimeField(null=True, blank=True)
    mindcase_last_polled_at = models.DateTimeField(null=True, blank=True)


class Opportunity(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pendiente"
        ACCEPTED = "ACCEPTED", "Aceptada"
        POSTPONED = "POSTPONED", "Postergada"
        DISCARDED = "DISCARDED", "Descartada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenancy.Tenant", on_delete=models.CASCADE, related_name="opportunities")
    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name="opportunities")
    product = models.ForeignKey("catalog.Product", on_delete=models.CASCADE, related_name="opportunities")
    score = models.PositiveSmallIntegerField(default=0)
    score_version = models.CharField(max_length=20, default="rules-v1")
    explanation = models.TextField(max_length=1000)
    score_breakdown = models.JSONField(default=dict)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    review_reason = models.CharField(max_length=500, blank=True)
    evaluated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score", "prospect__name", "product__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "prospect", "product"], name="unique_opportunity_per_tenant_prospect_product"
            )
        ]
        indexes = [models.Index(fields=["tenant", "status", "score"], name="opportunity_tenant_status_idx")]

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError

        errors = {}
        if self.prospect_id and self.tenant_id and self.prospect.tenant_id != self.tenant_id:
            errors["prospect"] = "El prospecto debe pertenecer a la misma empresa."
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            errors["product"] = "El producto debe pertenecer a la misma empresa."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.prospect} → {self.product} ({self.score})"
