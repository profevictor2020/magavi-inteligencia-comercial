from django.urls import path

from .views import ProspectDetailView, ProspectListCreateView

urlpatterns = [
    path("", ProspectListCreateView.as_view(), name="prospect-list"),
    path("<uuid:pk>/", ProspectDetailView.as_view(), name="prospect-detail"),
]
