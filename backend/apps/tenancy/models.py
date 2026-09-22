import re
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

hex_color_validator = RegexValidator(
    regex=r"^#[0-9A-Fa-f]{6}$",
    message="Use a six-digit hexadecimal color, for example #0D766E.",
)
hostname_pattern = re.compile(
    r"^(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)


def validate_demo_image_path(value: str) -> None:
    if not value.startswith("/static/demo/") or not value.lower().endswith((".svg", ".png", ".webp")):
        raise ValidationError("Demo images must use a local /static/demo/ SVG, PNG, or WebP path.")


def validate_featured_offerings(value: list) -> None:
    if not isinstance(value, list) or len(value) > 6:
        raise ValidationError("Featured offerings must be a list with at most six items.")
    for item in value:
        if not isinstance(item, dict) or set(item) != {"name", "description"}:
            raise ValidationError("Each offering must contain only name and description.")
        if not all(isinstance(item[key], str) and item[key].strip() for key in ("name", "description")):
            raise ValidationError("Offering names and descriptions must be non-empty text.")


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True, max_length=1000)
    headline = models.CharField(max_length=180)
    logo_path = models.CharField(max_length=255, validators=[validate_demo_image_path])
    primary_color = models.CharField(max_length=7, validators=[hex_color_validator], default="#0D766E")
    secondary_color = models.CharField(max_length=7, validators=[hex_color_validator], default="#F4BC57")
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    featured_offerings = models.JSONField(default=list, validators=[validate_featured_offerings])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        ADMIN = "ADMIN", "Admin"
        STAFF = "STAFF", "Staff"
        VIEWER = "VIEWER", "Viewer"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tenant", "user"], name="unique_tenant_user_membership"),
        ]
        ordering = ["tenant", "user"]

    def __str__(self) -> str:
        return f"{self.user} · {self.tenant} · {self.role}"


class TenantDomain(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="domains")
    hostname = models.CharField(max_length=253, unique=True)
    is_primary = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("hostname"),
                name="unique_tenant_domain_hostname_ci",
            ),
            models.UniqueConstraint(
                fields=["tenant"],
                condition=Q(is_primary=True),
                name="one_primary_domain_per_tenant",
            ),
        ]
        ordering = ["tenant", "-is_primary", "hostname"]

    def clean(self) -> None:
        super().clean()
        self.hostname = self.hostname.strip().rstrip(".").lower()
        if not hostname_pattern.fullmatch(self.hostname):
            raise ValidationError({"hostname": "Enter a valid hostname without scheme, path, or port."})

    def save(self, *args, **kwargs) -> None:
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.hostname
