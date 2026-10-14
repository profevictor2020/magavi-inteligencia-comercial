from django.contrib import admin

from .models import DiscoveryRun, Opportunity, Prospect, Territory


@admin.register(Territory)
class TerritoryAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "region", "prospect_goal", "is_active")
    list_filter = ("tenant", "region", "is_active")
    search_fields = ("name", "region")


@admin.register(Prospect)
class ProspectAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "territory", "industry", "city", "instagram_handle", "discovery_score", "status", "verified_at")
    list_filter = ("tenant", "status", "industry", "region")
    search_fields = ("name", "email", "phone", "website")
    readonly_fields = ("instagram_handle", "discovery_score")


@admin.register(DiscoveryRun)
class DiscoveryRunAdmin(admin.ModelAdmin):
    list_display = ("tenant", "status", "mindcase_job_id", "started_at", "finished_at", "profiles_found", "prospects_created")
    readonly_fields = ("tenant", "status", "started_at", "finished_at", "hashtags", "profiles_found", "prospects_created", "error")

    def has_add_permission(self, request):
        return False


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("prospect", "product", "tenant", "score", "status", "evaluated_at")
    list_filter = ("tenant", "status", "score_version")
    search_fields = ("prospect__name", "product__name", "product__sku")
    readonly_fields = ("score", "score_version", "explanation", "score_breakdown", "evaluated_at", "created_at")
