from django.urls import path

from .views import (
    GenerateOpportunitiesView,
    OpportunityDetailView,
    OpportunityListView,
    ProspectDetailView,
    ProspectListCreateView,
    TerritoryDetailView,
    TerritoryListCreateView,
)

urlpatterns = [
    path("territories/", TerritoryListCreateView.as_view(), name="territory-list"),
    path("territories/<uuid:pk>/", TerritoryDetailView.as_view(), name="territory-detail"),
    path("opportunities/", OpportunityListView.as_view(), name="opportunity-list"),
    path("opportunities/generate/", GenerateOpportunitiesView.as_view(), name="opportunity-generate"),
    path("opportunities/<uuid:pk>/", OpportunityDetailView.as_view(), name="opportunity-detail"),
    path("", ProspectListCreateView.as_view(), name="prospect-list"),
    path("<uuid:pk>/", ProspectDetailView.as_view(), name="prospect-detail"),
]
