from django.db.models import Q
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView

from apps.tenancy.permissions import TenantRolePermission

from .models import Prospect
from .serializers import ProspectSerializer


class ProspectMixin:
    permission_classes = [TenantRolePermission]
    serializer_class = ProspectSerializer

    def get_queryset(self):
        queryset = Prospect.objects.filter(tenant=self.request.tenant)
        search = self.request.query_params.get("search", "").strip()
        status = self.request.query_params.get("status", "").strip()
        industry = self.request.query_params.get("industry", "").strip()
        city = self.request.query_params.get("city", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search))
        if status:
            queryset = queryset.filter(status=status)
        if industry:
            queryset = queryset.filter(industry__icontains=industry)
        if city:
            queryset = queryset.filter(city__icontains=city)
        return queryset

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class ProspectListCreateView(ProspectMixin, ListCreateAPIView):
    pass


class ProspectDetailView(ProspectMixin, RetrieveUpdateDestroyAPIView):
    pass
