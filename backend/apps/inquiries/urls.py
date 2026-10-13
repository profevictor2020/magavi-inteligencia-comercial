from django.urls import path

from .views import PublicPurchaseOrderCreateView, PublicQuoteRequestCreateView, PurchaseOrderDetailView, PurchaseOrderListView, QuoteFollowUpView, QuoteIssueView, QuotePrintView, QuoteRequestDetailView, QuoteRequestListView, QuoteView

urlpatterns = [
    path("public/", PublicQuoteRequestCreateView.as_view(), name="public-quote-request"),
    path("orders/public/", PublicPurchaseOrderCreateView.as_view(), name="public-purchase-order"),
    path("orders/", PurchaseOrderListView.as_view(), name="purchase-order-list"),
    path("orders/<uuid:pk>/", PurchaseOrderDetailView.as_view(), name="purchase-order-detail"),
    path("", QuoteRequestListView.as_view(), name="quote-request-list"),
    path("<uuid:pk>/", QuoteRequestDetailView.as_view(), name="quote-request-detail"),
    path("<uuid:pk>/quote/", QuoteView.as_view(), name="quote-detail"),
    path("<uuid:pk>/quote/issue/", QuoteIssueView.as_view(), name="quote-issue"),
    path("<uuid:pk>/quote/follow-up/", QuoteFollowUpView.as_view(), name="quote-follow-up"),
    path("<uuid:pk>/quote/print/", QuotePrintView.as_view(), name="quote-print"),
]
