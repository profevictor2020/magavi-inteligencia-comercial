from django.contrib import admin

from .models import Quote, QuoteItem, QuoteRequest, QuoteRequestItem


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


class QuoteItemInline(admin.TabularInline):
    model = QuoteItem
    extra = 0
    readonly_fields = ("request_item", "product_name", "product_sku", "quantity", "unit_price")
    can_delete = False


@admin.register(Quote)
class QuoteAdmin(admin.ModelAdmin):
    list_display = ("folio", "tenant", "request", "status", "valid_until", "created_at")
    list_filter = ("status", "tenant")
    readonly_fields = ("tenant", "request", "status", "valid_until", "tax_rate", "notes", "issued_at", "created_at", "updated_at")
    inlines = (QuoteItemInline,)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
