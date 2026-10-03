from django.contrib import admin

from .models import QuoteRequest, QuoteRequestItem


class QuoteRequestItemInline(admin.TabularInline):
    model = QuoteRequestItem
    extra = 0
    readonly_fields = ("product", "product_name", "product_sku", "quantity")
    can_delete = False


@admin.register(QuoteRequest)
class QuoteRequestAdmin(admin.ModelAdmin):
    list_display = ("full_name", "company_name", "tenant", "status", "created_at")
    list_filter = ("status", "tenant")
    search_fields = ("full_name", "company_name", "email", "phone")
    readonly_fields = ("tenant", "full_name", "company_name", "email", "phone", "message", "consent_at", "created_at", "updated_at")
    inlines = (QuoteRequestItemInline,)
