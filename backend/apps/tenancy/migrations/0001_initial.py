import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models.functions import Lower

import apps.tenancy.models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Tenant",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=160)),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("description", models.TextField(blank=True, max_length=1000)),
                ("headline", models.CharField(max_length=180)),
                ("logo_path", models.CharField(max_length=255, validators=[apps.tenancy.models.validate_demo_image_path])),
                ("primary_color", models.CharField(default="#0D766E", max_length=7, validators=[apps.tenancy.models.hex_color_validator])),
                ("secondary_color", models.CharField(default="#F4BC57", max_length=7, validators=[apps.tenancy.models.hex_color_validator])),
                ("contact_email", models.EmailField(blank=True, max_length=254)),
                ("contact_phone", models.CharField(blank=True, max_length=40)),
                ("featured_offerings", models.JSONField(default=list, validators=[apps.tenancy.models.validate_featured_offerings])),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Membership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("OWNER", "Owner"), ("ADMIN", "Admin"), ("STAFF", "Staff"), ("VIEWER", "Viewer")], default="VIEWER", max_length=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="tenancy.tenant")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["tenant", "user"]},
        ),
        migrations.CreateModel(
            name="TenantDomain",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hostname", models.CharField(max_length=253, unique=True)),
                ("is_primary", models.BooleanField(default=False)),
                ("is_verified", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="domains", to="tenancy.tenant")),
            ],
            options={"ordering": ["tenant", "-is_primary", "hostname"]},
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.UniqueConstraint(fields=("tenant", "user"), name="unique_tenant_user_membership"),
        ),
        migrations.AddConstraint(
            model_name="tenantdomain",
            constraint=models.UniqueConstraint(Lower("hostname"), name="unique_tenant_domain_hostname_ci"),
        ),
        migrations.AddConstraint(
            model_name="tenantdomain",
            constraint=models.UniqueConstraint(condition=models.Q(("is_primary", True)), fields=("tenant",), name="one_primary_domain_per_tenant"),
        ),
    ]
