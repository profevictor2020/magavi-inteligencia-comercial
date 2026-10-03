from django.contrib import admin

from .models import Prospect, Territory


@admin.register(Territory)
class TerritoryAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "region", "prospect_goal", "is_active")
    list_filter = ("tenant", "region", "is_active")
    search_fields = ("name", "region")


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "territory", "industry", "city", "status", "verified_at")
    list_filter = ("tenant", "status", "industry", "region")
    search_fields = ("name", "email", "phone", "website")
