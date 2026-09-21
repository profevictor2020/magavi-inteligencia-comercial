from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.health.urls")),
]

# React owns all non-API browser routes. The compiled index exists in Docker/production.
urlpatterns += [re_path(r"^(?!api/|admin/|static/).*$", TemplateView.as_view(template_name="index.html"))]
