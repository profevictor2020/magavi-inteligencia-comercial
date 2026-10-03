from django.urls import path

from .views import ProspectDetailView, ProspectListCreateView, TerritoryDetailView, TerritoryListCreateView

urlpatterns = [
    path("territories/", TerritoryListCreateView.as_view(), name="territory-list"),
    path("territories/<uuid:pk>/", TerritoryDetailView.as_view(), name="territory-detail"),
    path("", ProspectListCreateView.as_view(), name="prospect-list"),
    path("<uuid:pk>/", ProspectDetailView.as_view(), name="prospect-detail"),
]
