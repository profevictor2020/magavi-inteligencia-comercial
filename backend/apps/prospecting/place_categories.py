"""Reviewable commercial-category rules for Places; no AI or paid calls."""

import re

from .chile import normalized_location
from .google_places import PlacesProviderError


# A job may select one or more families. These aliases relate buyer searches to
# provider categories without requiring identical words (cafeterías -> Espresso bar).
# New families and aliases require reviewed code changes until a tenant UI exists.
CATEGORY_FAMILIES = {
    "cafe": {
        "label": "cafeterías",
        "queries": ("cafe", "cafeteria", "cafeterias", "coffee shop", "coffee shops", "espresso"),
        "places": ("cafe", "cafeteria", "coffee shop", "espresso bar"),
    },
    "bakery": {
        "label": "panaderías y pastelerías",
        "queries": ("panaderia", "panaderias", "pasteleria", "pastelerias", "bakery", "bakeries"),
        "places": ("panaderia", "pasteleria", "bakery", "bakeshop", "pastry shop"),
    },
    "restaurant": {
        "label": "restaurantes",
        "queries": ("restaurante", "restaurantes", "restaurant", "restaurants", "sushi", "marisqueria", "marisquerias"),
        "places": ("restaurante", "restaurant", "sushi restaurant", "seafood restaurant", "marisqueria"),
    },
    "hotel": {
        "label": "hoteles",
        "queries": ("hotel", "hoteles", "hostal", "hostales", "lodging"),
        "places": ("hotel", "hostal", "lodging", "inn"),
    },
}


def _contains_phrase(text, phrase):
    return bool(re.search(rf"(?<!\w){re.escape(normalized_location(phrase))}(?!\w)", text))


def resolve_category_families(keywords, selected):
    """Explicit job selection wins; known buyer terms provide conservative defaults."""
    if not isinstance(selected, list) or any(item not in CATEGORY_FAMILIES for item in selected):
        raise PlacesProviderError("La búsqueda contiene rubros comerciales no configurados.")
    if selected:
        return tuple(dict.fromkeys(selected))
    query = normalized_location(keywords)
    return tuple(code for code, rule in CATEGORY_FAMILIES.items()
                 if any(_contains_phrase(query, alias) for alias in rule["queries"]))


def category_rejection(place, keywords, selected):
    families = resolve_category_families(keywords, selected)
    if not families:
        return "No hay una regla comercial configurada para esta búsqueda."
    categories = [normalized_location(value) for value in [place.category, *place.all_categories] if value]
    if any(_contains_phrase(category, alias) for code in families
           for category in categories for alias in CATEGORY_FAMILIES[code]["places"]):
        return ""
    labels = ", ".join(CATEGORY_FAMILIES[code]["label"] for code in families)
    return f"La categoría «{place.category}» no corresponde al rubro solicitado: {labels}."[:500]
