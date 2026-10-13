from django.db import migrations, models


def number_existing_quotes(apps, schema_editor):
    Quote = apps.get_model("inquiries", "Quote")
    database = schema_editor.connection.alias
    current_tenant = None
    number = 0
    existing = Quote.objects.using(database).order_by("tenant_id", "created_at", "id").values_list("id", "tenant_id")
    for quote_id, tenant_id in existing.iterator():
        if tenant_id != current_tenant:
            current_tenant = tenant_id
            number = 0
        number += 1
        Quote.objects.using(database).filter(pk=quote_id).update(number=number)


class Migration(migrations.Migration):
    dependencies = [("inquiries", "0002_quote_quoteitem")]

    operations = [
        migrations.AddField(
            model_name="quote",
            name="number",
            field=models.PositiveIntegerField(editable=False, null=True),
        ),
        migrations.RunPython(number_existing_quotes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="quote",
            name="number",
            field=models.PositiveIntegerField(editable=False),
        ),
        migrations.AddConstraint(
            model_name="quote",
            constraint=models.UniqueConstraint(fields=("tenant", "number"), name="unique_quote_number_per_tenant"),
        ),
    ]
