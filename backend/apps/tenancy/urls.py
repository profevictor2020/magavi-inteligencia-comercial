from django.urls import path

from .views import PublicLandingView, PublicLogoView, TenantContextView, TenantDetailView, TenantLogoView

urlpatterns = [
    path("public/landing/", PublicLandingView.as_view(), name="public-landing"),
    path("public/logo/", PublicLogoView.as_view(), name="public-logo"),
    path("tenant/context/", TenantContextView.as_view(), name="tenant-context"),
    path("tenant/logo/", TenantLogoView.as_view(), name="tenant-logo"),
    path("tenants/<uuid:tenant_id>/", TenantDetailView.as_view(), name="tenant-detail"),
]
