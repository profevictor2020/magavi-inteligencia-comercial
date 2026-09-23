from unittest.mock import patch

from django.db import DatabaseError
from django.urls import reverse
from rest_framework.test import APIClient


def test_health_reports_application_and_database_available(db):
    response = APIClient().get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_is_public(db):
    response = APIClient().get(reverse("health"))

    assert response.status_code == 200


def test_health_reports_database_failure(db):
    with patch("apps.health.views.connection.cursor", side_effect=DatabaseError):
        response = APIClient().get(reverse("health"))

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}
