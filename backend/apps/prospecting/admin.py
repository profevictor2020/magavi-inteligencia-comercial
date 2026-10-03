from django.contrib import admin

from .models import Prospect


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "industry", "city", "status", "verified_at")
    list_filter = ("tenant", "status", "industry", "region")
    search_fields = ("name", "email", "phone", "website")
