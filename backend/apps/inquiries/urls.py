from django.urls import path

from .views import PublicQuoteRequestCreateView, QuoteRequestDetailView, QuoteRequestListView

urlpatterns = [
    path("public/", PublicQuoteRequestCreateView.as_view(), name="public-quote-request"),
    path("", QuoteRequestListView.as_view(), name="quote-request-list"),
    path("<uuid:pk>/", QuoteRequestDetailView.as_view(), name="quote-request-detail"),
]
