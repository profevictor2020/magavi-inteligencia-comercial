from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """MAGAVI user, intentionally minimal but extensible from the first migration."""

    email = models.EmailField("correo electrónico", unique=True)
