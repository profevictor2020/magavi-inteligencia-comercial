"""Mindcase Google Maps Places adapter. No scheduled or user-facing execution in Phase 1."""

import json
import os
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


PLACES_URL = "https://api.mindcase.co/v1/data/google-maps/places/run?wait=true"


class PlacesProviderError(Exception):
    def __init__(self, message, *, submission_uncertain=False):
        super().__init__(message)
        self.submission_uncertain = submission_uncertain


@dataclass(frozen=True)
class GooglePlace:
    place_id: str
    name: str
    city: str
    region: str
    country: str
    address: str
    category: str
    all_categories: list[str]
    latitude: Decimal | None
    longitude: Decimal | None
    rating: Decimal | None
    reviews: int | None
    phone: str
    website: str
    place_url: str
    permanently_closed: bool | None
    temporarily_closed: bool | None


def _text(value, length):
    return value.strip()[:length] if isinstance(value, str) else ""


def _url(value):
    candidate = _text(value, 500)
    try:
        parts = urlsplit(candidate)
    except ValueError:
        return ""
    return candidate if parts.scheme.lower() in {"http", "https"} and parts.hostname else ""


def _decimal(value, lower, upper):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return number if number.is_finite() and lower <= number <= upper else None


def _count(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        count = int(value)
    except (TypeError, ValueError):
        return None
    return count if count >= 0 and str(value).strip() == str(count) else None


def _boolean(value):
    return value if isinstance(value, bool) else None


def normalize_place(row):
    """Only fields observed in the controlled Places export are interpreted."""
    if not isinstance(row, dict):
        raise PlacesProviderError("El resultado de Places no es un objeto.")
    categories = row.get("allCategories")
    return GooglePlace(
        place_id=_text(row.get("placeId"), 255),
        name=_text(row.get("businessName"), 180),
        city=_text(row.get("city"), 120),
        region=_text(row.get("state"), 120),
        country=_text(row.get("country"), 120),
        address=_text(row.get("address"), 240),
        category=_text(row.get("category"), 180),
        all_categories=[_text(item, 180) for item in categories if isinstance(item, str) and item.strip()][:30]
        if isinstance(categories, list) else [],
        latitude=_decimal(row.get("latitude"), -90, 90),
        longitude=_decimal(row.get("longitude"), -180, 180),
        rating=_decimal(row.get("rating"), 0, 5),
        reviews=_count(row.get("reviews")),
        phone=_text(row.get("phone"), 40),
        website=_url(row.get("website")),
        place_url=_url(row.get("placeUrl")),
        permanently_closed=_boolean(row.get("permanentlyClosed")),
        temporarily_closed=_boolean(row.get("temporarilyClosed")),
    )


class GoogleMapsPlacesProvider:
    """Synchronous endpoint verified in the playground; not wired to app routes."""

    @staticmethod
    def payload(*, keywords, location, max_results=1):
        if not isinstance(keywords, str) or not keywords.strip() or not isinstance(location, str) or not location.strip():
            raise PlacesProviderError("Indica una categoría y una ubicación para Places.")
        # One result is the only limit exercised in the controlled trial.
        if type(max_results) is not int or max_results != 1:
            raise PlacesProviderError("La Fase 1 solo admite un resultado por extracción.")
        return {"params": {"keywords": keywords.strip(), "location": location.strip(), "maxResults": 1,
                           "minimumRating": "", "websiteFilter": "", "maxImages": 0}}

    @staticmethod
    def normalize_results(response):
        if not isinstance(response, list):
            raise PlacesProviderError("El resultado de Places debe ser un array JSON.")
        return [normalize_place(row) for row in response]

    def run_sync(self, *, keywords, location, max_results=1):
        """One explicit POST; an uncertain outcome must be reconciled, never retried.

        Phase 1 does not invoke this from a view or scheduler. A timeout or
        malformed 200 response may still represent a charged provider run.
        """
        payload = self.payload(keywords=keywords, location=location, max_results=max_results)
        key = os.getenv("MINDCASE_API_KEY")
        if not key:
            raise PlacesProviderError("Falta MINDCASE_API_KEY para consultar Places.")
        request = Request(PLACES_URL, data=json.dumps(payload).encode("utf-8"), method="POST",
                          headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                   "Accept": "application/json"})
        try:
            with urlopen(request, timeout=35) as response:
                data = json.load(response)
        except HTTPError as error:
            raise PlacesProviderError(f"Mindcase respondió HTTP {error.code}.",
                                      submission_uncertain=error.code >= 500 or error.code == 429) from error
        except (TimeoutError, URLError) as error:
            raise PlacesProviderError("Mindcase no confirmó el resultado; revisa Run History antes de reintentar.",
                                      submission_uncertain=True) from error
        except (ValueError, UnicodeError) as error:
            raise PlacesProviderError("Mindcase devolvió JSON inválido; revisa Run History antes de reintentar.",
                                      submission_uncertain=True) from error
        try:
            return self.normalize_results(data)
        except PlacesProviderError as error:
            raise PlacesProviderError("Mindcase devolvió un formato inesperado; revisa Run History antes de reintentar.",
                                      submission_uncertain=True) from error
