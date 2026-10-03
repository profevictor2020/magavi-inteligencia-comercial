import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [("tenancy", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Prospect",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=180)),
                ("industry", models.CharField(blank=True, max_length=120)),
                ("address", models.CharField(blank=True, max_length=240)),
                ("city", models.CharField(blank=True, max_length=120)),
                ("region", models.CharField(blank=True, max_length=120)),
                ("website", models.URLField(blank=True)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("phone", models.CharField(blank=True, max_length=40)),
                ("source", models.CharField(max_length=240)),
                ("notes", models.TextField(blank=True, max_length=2000)),
                ("verified_at", models.DateField(blank=True, null=True)),
                ("status", models.CharField(choices=[("NEW", "Nuevo"), ("REVIEWED", "Revisado"), ("DISCARDED", "Descartado")], default="NEW", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="prospects", to="tenancy.tenant")),
            ],
            options={"ordering": ["name", "id"]},
        ),
        migrations.AddIndex(
            model_name="prospect",
            index=models.Index(fields=["tenant", "status", "name"], name="prospect_tenant_status_idx"),
        ),
    ]
