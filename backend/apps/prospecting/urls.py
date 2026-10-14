from django.urls import path

from .views import (
    GenerateOpportunitiesView,
    DiscoveryStatusView,
    DiscoveryEvaluationListView,
    ManualDiscoveryView,
    ScheduledDiscoveryView,
    OpportunityDetailView,
    OpportunityListView,
    ProspectDetailView,
    ProspectListCreateView,
    TerritoryDetailView,
    TerritoryListCreateView,
    ChileanRegionListView,
)

urlpatterns = [
    path("discovery/", DiscoveryStatusView.as_view(), name="prospect-discovery-status"),
    path("discovery/evaluations/", DiscoveryEvaluationListView.as_view(), name="prospect-discovery-evaluations"),
    path("discovery/test/", ManualDiscoveryView.as_view(), name="prospect-discovery-test"),
    path("discovery/run/", ScheduledDiscoveryView.as_view(), name="prospect-discovery-run"),
    path("territories/", TerritoryListCreateView.as_view(), name="territory-list"),
    path("territories/regions/", ChileanRegionListView.as_view(), name="territory-regions"),
    path("territories/<uuid:pk>/", TerritoryDetailView.as_view(), name="territory-detail"),
    path("opportunities/", OpportunityListView.as_view(), name="opportunity-list"),
    path("opportunities/generate/", GenerateOpportunitiesView.as_view(), name="opportunity-generate"),
    path("opportunities/<uuid:pk>/", OpportunityDetailView.as_view(), name="opportunity-detail"),
    path("", ProspectListCreateView.as_view(), name="prospect-list"),
    path("<uuid:pk>/", ProspectDetailView.as_view(), name="prospect-detail"),
]
