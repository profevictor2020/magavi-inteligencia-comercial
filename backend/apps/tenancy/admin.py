from django.contrib import admin

from .models import Membership, Tenant, TenantDomain


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ("user",)


class TenantDomainInline(admin.TabularInline):
    model = TenantDomain
    extra = 0


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = (TenantDomainInline, MembershipInline)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "tenant", "role", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("user__username", "user__email", "tenant__name")
    autocomplete_fields = ("user", "tenant")


@admin.register(TenantDomain)
class TenantDomainAdmin(admin.ModelAdmin):
    list_display = ("hostname", "tenant", "is_primary", "is_verified", "is_active")
    list_filter = ("is_primary", "is_verified", "is_active")
    search_fields = ("hostname", "tenant__name")
    autocomplete_fields = ("tenant",)
