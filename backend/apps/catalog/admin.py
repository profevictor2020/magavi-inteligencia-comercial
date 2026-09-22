from django.contrib import admin

from .models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "is_active", "updated_at")
    list_filter = ("is_active", "tenant")
    search_fields = ("name", "tenant__name")
    autocomplete_fields = ("tenant",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "tenant", "category", "price", "is_available", "is_published")
    list_filter = ("is_available", "is_published", "tenant", "category")
    search_fields = ("name", "sku", "tenant__name")
    autocomplete_fields = ("tenant", "category")

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if obj and "category" in form.base_fields:
            form.base_fields["category"].queryset = Category.objects.filter(tenant=obj.tenant)
        return form
