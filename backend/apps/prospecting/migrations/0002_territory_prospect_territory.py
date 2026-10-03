import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("prospecting", "0001_initial"), ("tenancy", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="Territory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=140)),
                ("description", models.TextField(blank=True, max_length=800)),
                ("region", models.CharField(blank=True, max_length=120)),
                ("localities", models.JSONField(blank=True, default=list)),
                ("prospect_goal", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="territories", to="tenancy.tenant")),
            ],
            options={"ordering": ["name", "id"]},
        ),
        migrations.AddConstraint(
            model_name="territory",
            constraint=models.UniqueConstraint(fields=("tenant", "name"), name="unique_territory_name_per_tenant"),
        ),
        migrations.AddField(
            model_name="prospect",
            name="territory",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="prospects", to="prospecting.territory"),
        ),
    ]
