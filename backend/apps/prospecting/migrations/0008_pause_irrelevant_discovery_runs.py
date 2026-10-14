from django.db import migrations


PAUSE_MESSAGE = (
    "Mindcase devolvió perfiles, pero ninguno cumplió los criterios comerciales "
    "y territoriales. La búsqueda se pausó para evitar nuevos cargos; "
    "revisa Perfiles evaluados antes de reactivarla."
)


def pause_irrelevant_runs(apps, schema_editor):
    DiscoveryRun = apps.get_model("prospecting", "DiscoveryRun")
    DiscoveryEvaluation = apps.get_model("prospecting", "DiscoveryEvaluation")
    for run in DiscoveryRun.objects.filter(enabled=True, status="COMPLETED", profiles_found__gte=5,
                                           prospects_created=0, evaluation_batch_id__isnull=False).iterator():
        decisions = DiscoveryEvaluation.objects.filter(tenant_id=run.tenant_id, batch_id=run.evaluation_batch_id)
        if decisions.count() >= 5 and not decisions.filter(decision__in=["CREATED", "EXISTING"]).exists():
            run.enabled = False
            run.error = PAUSE_MESSAGE
            run.save(update_fields=["enabled", "error"])


class Migration(migrations.Migration):
    dependencies = [
        ("prospecting", "0007_discoveryrun_evaluation_batch_id_discoveryevaluation"),
    ]

    operations = [migrations.RunPython(pause_irrelevant_runs, migrations.RunPython.noop)]
