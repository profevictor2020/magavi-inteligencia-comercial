import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError


@pytest.mark.django_db
def test_custom_user_requires_unique_email():
    user_model = get_user_model()
    user_model.objects.create_user(username="primera", email="demo@example.test", password=None)

    with pytest.raises(IntegrityError):
        user_model.objects.create_user(username="segunda", email="demo@example.test", password=None)
