from django.urls import path

from .views import PublicLandingView, TenantContextView, TenantDetailView

urlpatterns = [
    path("public/landing/", PublicLandingView.as_view(), name="public-landing"),
    path("tenant/context/", TenantContextView.as_view(), name="tenant-context"),
    path("tenants/<uuid:tenant_id>/", TenantDetailView.as_view(), name="tenant-detail"),
]
