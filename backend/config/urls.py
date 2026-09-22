from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

from .views import PrivateAppView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.health.urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/catalog/", include("apps.catalog.urls")),
    path("api/", include("apps.tenancy.urls")),
]

# React owns browser routes. Django protects the private shell before returning index.html.
urlpatterns += [
    path("app/login/", TemplateView.as_view(template_name="index.html"), name="app-login"),
    path("app/", PrivateAppView.as_view(), name="private-app"),
    re_path(r"^app/.+$", PrivateAppView.as_view(), name="private-app-route"),
    re_path(r"^(?!api/|admin/|static/).*$", TemplateView.as_view(template_name="index.html")),
]
