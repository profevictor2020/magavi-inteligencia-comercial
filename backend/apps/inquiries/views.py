from rest_framework.generics import CreateAPIView, ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle

from apps.tenancy.permissions import TenantRolePermission

from .models import QuoteRequest
from .serializers import PrivateQuoteRequestSerializer, PublicQuoteRequestSerializer


class PublicQuoteRequestCreateView(CreateAPIView):
    serializer_class = PublicQuoteRequestSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public-inquiry"

    def perform_create(self, serializer):
        serializer.save()


class QuoteRequestListView(ListAPIView):
    serializer_class = PrivateQuoteRequestSerializer
    permission_classes = [TenantRolePermission]

    def get_queryset(self):
        return QuoteRequest.objects.filter(tenant=self.request.tenant).prefetch_related("items")


class QuoteRequestDetailView(RetrieveUpdateAPIView):
    serializer_class = PrivateQuoteRequestSerializer
    permission_classes = [TenantRolePermission]

    def get_queryset(self):
        return QuoteRequest.objects.filter(tenant=self.request.tenant).prefetch_related("items")
