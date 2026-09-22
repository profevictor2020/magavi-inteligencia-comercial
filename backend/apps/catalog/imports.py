import csv
import io
import secrets
import time
from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import Category, Product

CSV_HEADERS = ("sku", "nombre", "categoria", "descripcion", "formato", "precio", "disponible", "publicar")
MAX_CSV_BYTES = 1_000_000
MAX_CSV_ROWS = 500
PREVIEW_TTL_SECONDS = 30 * 60
TRUE_VALUES = {"1", "si", "sí", "true", "verdadero", "yes"}
FALSE_VALUES = {"0", "no", "false", "falso"}


class CatalogImportError(ValueError):
    pass


def csv_template() -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(CSV_HEADERS)
    writer.writerow(
        ("CAFE-001", "Café premium", "Abarrotes", "Café para negocios", "Caja 12 unidades", "24990", "sí", "no")
    )
    return output.getvalue()


def _text(value) -> str:
    return str(value or "").strip()


def _boolean(value: str, field: str, errors: list[str]) -> bool | None:
    normalized = value.casefold()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    errors.append(f"{field} debe ser sí o no.")
    return None


def _price(value: str, errors: list[str]) -> str | None:
    if not value:
        return None
    try:
        parsed = Decimal(value.replace(".", "").replace(",", ".") if "," in value else value)
    except InvalidOperation:
        errors.append("precio debe ser un número válido.")
        return None
    if parsed < 0:
        errors.append("precio no puede ser negativo.")
        return None
    if parsed.as_tuple().exponent < -2 or parsed >= Decimal("10000000000"):
        errors.append("precio debe tener máximo dos decimales y diez dígitos enteros.")
        return None
    return f"{parsed:.2f}"


def preview_csv(uploaded_file, tenant) -> dict:
    if uploaded_file.size > MAX_CSV_BYTES:
        raise CatalogImportError("El archivo supera el máximo permitido de 1 MB.")
    if not uploaded_file.name.lower().endswith(".csv"):
        raise CatalogImportError("Selecciona un archivo con extensión .csv.")
    try:
        content = uploaded_file.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CatalogImportError("El archivo debe usar codificación UTF-8.") from exc

    reader = csv.DictReader(io.StringIO(content, newline=""))
    headers = tuple(reader.fieldnames or ())
    if headers != CSV_HEADERS:
        raise CatalogImportError(f"Las columnas deben ser exactamente: {', '.join(CSV_HEADERS)}.")

    existing_skus = set(Product.objects.filter(tenant=tenant).values_list("sku", flat=True))
    rows = []
    normalized_rows = []
    seen_skus = set()
    for row_number, source in enumerate(reader, start=2):
        if row_number > MAX_CSV_ROWS + 1:
            raise CatalogImportError(f"El archivo puede contener como máximo {MAX_CSV_ROWS} productos.")
        errors: list[str] = []
        warnings: list[str] = []
        sku = _text(source["sku"])
        name = _text(source["nombre"])
        category = _text(source["categoria"])
        description = _text(source["descripcion"])
        product_format = _text(source["formato"])
        if not sku:
            errors.append("sku es obligatorio.")
        elif len(sku) > 80:
            errors.append("sku supera 80 caracteres.")
        elif sku.casefold() in seen_skus:
            errors.append("sku está repetido en el archivo.")
        seen_skus.add(sku.casefold())
        if not name:
            errors.append("nombre es obligatorio.")
        elif len(name) > 160:
            errors.append("nombre supera 160 caracteres.")
        if not category:
            errors.append("categoria es obligatoria.")
        elif len(category) > 120:
            errors.append("categoria supera 120 caracteres.")
        if len(description) > 1000:
            errors.append("descripcion supera 1000 caracteres.")
        if len(product_format) > 120:
            errors.append("formato supera 120 caracteres.")
        if not product_format:
            warnings.append("formato está vacío.")
        price = _price(_text(source["precio"]), errors)
        available = _boolean(_text(source["disponible"]), "disponible", errors)
        published = _boolean(_text(source["publicar"]), "publicar", errors)
        action = "actualizar" if sku in existing_skus else "crear"
        normalized = {
            "sku": sku,
            "name": name,
            "category": category,
            "description": description,
            "format": product_format,
            "price": price,
            "is_available": available,
            "is_published": published,
        }
        rows.append(
            {
                "row": row_number,
                "sku": sku,
                "name": name,
                "category": category,
                "price": price,
                "action": action,
                "errors": errors,
                "warnings": warnings,
            }
        )
        normalized_rows.append(normalized)

    if not rows:
        raise CatalogImportError("El archivo no contiene productos.")
    error_count = sum(bool(row["errors"]) for row in rows)
    return {
        "valid": error_count == 0,
        "rows": rows,
        "normalized_rows": normalized_rows,
        "summary": {
            "total": len(rows),
            "create": sum(row["action"] == "crear" for row in rows),
            "update": sum(row["action"] == "actualizar" for row in rows),
            "errors": error_count,
            "warnings": sum(bool(row["warnings"]) for row in rows),
        },
    }


def save_preview(session, tenant_id, normalized_rows) -> str:
    token = secrets.token_urlsafe(24)
    previews = session.get("catalog_import_previews", {})
    previews[token] = {"tenant_id": str(tenant_id), "created_at": int(time.time()), "rows": normalized_rows}
    session["catalog_import_previews"] = previews
    session.modified = True
    return token


def confirm_preview(session, tenant, token: str) -> dict:
    previews = session.get("catalog_import_previews", {})
    preview = previews.get(token)
    if not preview or preview["tenant_id"] != str(tenant.id):
        raise CatalogImportError("La vista previa no existe o pertenece a otra empresa.")
    if int(time.time()) - preview["created_at"] > PREVIEW_TTL_SECONDS:
        previews.pop(token, None)
        session["catalog_import_previews"] = previews
        raise CatalogImportError("La vista previa expiró. Vuelve a cargar el archivo.")

    created = updated = 0
    with transaction.atomic():
        for row in preview["rows"]:
            category, _ = Category.objects.get_or_create(tenant=tenant, name=row["category"])
            _, was_created = Product.objects.update_or_create(
                tenant=tenant,
                sku=row["sku"],
                defaults={
                    "category": category,
                    "name": row["name"],
                    "description": row["description"],
                    "format": row["format"],
                    "price": row["price"],
                    "is_available": row["is_available"],
                    "is_published": row["is_published"],
                },
            )
            created += was_created
            updated += not was_created
    previews.pop(token, None)
    session["catalog_import_previews"] = previews
    session.modified = True
    return {"created": created, "updated": updated, "total": created + updated}
