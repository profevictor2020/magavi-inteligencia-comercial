import os
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from apps.tenancy.models import Tenant
from apps.tenancy.permissions import TenantRolePermission

from .discovery import DiscoveryError, configured, run_tenant_discovery
from .matching import generate_opportunities
from .models import DiscoveryRun, Opportunity, Prospect, Territory
from .serializers import OpportunitySerializer, ProspectSerializer, TerritorySerializer


class TerritoryMixin:
    permission_classes = [TenantRolePermission]
    serializer_class = TerritorySerializer

    def get_queryset(self):
        return Territory.objects.filter(tenant=self.request.tenant).annotate(
            prospect_count=Count("prospects", distinct=True),
            reviewed_count=Count("prospects", filter=Q(prospects__status=Prospect.Status.REVIEWED), distinct=True),
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class TerritoryListCreateView(TerritoryMixin, ListCreateAPIView):
    pass


class TerritoryDetailView(TerritoryMixin, RetrieveUpdateDestroyAPIView):
    pass


class ProspectMixin:
    permission_classes = [TenantRolePermission]
    serializer_class = ProspectSerializer

    def get_queryset(self):
        queryset = Prospect.objects.filter(tenant=self.request.tenant).select_related("territory")
        search = self.request.query_params.get("search", "").strip()
        status = self.request.query_params.get("status", "").strip()
        industry = self.request.query_params.get("industry", "").strip()
        city = self.request.query_params.get("city", "").strip()
        territory = self.request.query_params.get("territory", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search))
        if status:
            queryset = queryset.filter(status=status)
        if industry:
            queryset = queryset.filter(industry=industry)
        if city:
            queryset = queryset.filter(city__icontains=city)
        if territory:
            queryset = queryset.filter(territory_id=territory)
        return queryset

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class ProspectListCreateView(ProspectMixin, ListCreateAPIView):
    pass


class ProspectDetailView(ProspectMixin, RetrieveUpdateDestroyAPIView):
    pass


class OpportunityListView(ListCreateAPIView):
    permission_classes = [TenantRolePermission]
    serializer_class = OpportunitySerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = Opportunity.objects.filter(tenant=self.request.tenant).select_related(
            "prospect", "prospect__territory", "product"
        )
        status = self.request.query_params.get("status", "").strip()
        territory = self.request.query_params.get("territory", "").strip()
        minimum_score = self.request.query_params.get("minimum_score", "").strip()
        if status:
            queryset = queryset.filter(status=status)
        if territory:
            queryset = queryset.filter(prospect__territory_id=territory)
        if minimum_score.isdigit():
            queryset = queryset.filter(score__gte=int(minimum_score))
        return queryset


class OpportunityDetailView(RetrieveUpdateAPIView):
    permission_classes = [TenantRolePermission]
    serializer_class = OpportunitySerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return Opportunity.objects.filter(tenant=self.request.tenant).select_related(
            "prospect", "prospect__territory", "product"
        )


class GenerateOpportunitiesView(APIView):
    permission_classes = [TenantRolePermission]

    def post(self, request):
        return Response(generate_opportunities(request.tenant))


class DiscoveryStatusView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        run = DiscoveryRun.objects.filter(tenant=request.tenant).first()
        return Response({
            "configured": configured() and bool(os.getenv("AUTOMATION_TOKEN")),
            "enabled": run.enabled if run else False,
            "status": run.status if run and run.started_at else "NOT_STARTED",
            "started_at": run.started_at if run else None,
            "finished_at": run.finished_at if run else None,
            "hashtags": run.hashtags if run else [],
            "profiles_found": run.profiles_found if run else 0,
            "prospects_created": run.prospects_created if run else 0,
            "error": run.error if run else "",
        })

    def patch(self, request):
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return Response({"enabled": "Indica true o false."}, status=status.HTTP_400_BAD_REQUEST)
        run, _ = DiscoveryRun.objects.get_or_create(tenant=request.tenant)
        run.enabled = enabled
        run.save(update_fields=["enabled"])
        return self.get(request)


class ScheduledDiscoveryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        secret = os.getenv("AUTOMATION_TOKEN", "")
        supplied = request.headers.get("Authorization", "")
        if not secret:
            return Response({"detail": "La tarea automática no está configurada."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not constant_time_compare(supplied, f"Bearer {secret}"):
            return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)
        if not configured():
            return Response({"detail": "Faltan credenciales para Instagram o IA."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        cutoff = timezone.now() - timedelta(hours=20)
        tenant = (Tenant.objects.filter(is_active=True)
                  .filter(discovery_run__enabled=True)
                  .exclude(discovery_run__status=DiscoveryRun.Status.RUNNING, discovery_run__started_at__gte=timezone.now() - timedelta(minutes=10))
                  .filter(Q(discovery_run__status=DiscoveryRun.Status.FAILED) | Q(discovery_run__finished_at__isnull=True) | Q(discovery_run__finished_at__lt=cutoff))
                  .order_by("discovery_run__finished_at", "id").first())
        if tenant is None:
            return Response({"status": "no_due_tenants"})
        try:
            result = run_tenant_discovery(tenant)
        except DiscoveryError:
            return Response({"status": "failed", "detail": "La búsqueda falló; revisa el estado en Prospectos."}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            return Response({"status": "failed", "detail": "La búsqueda falló; revisa los registros del servidor."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"tenant": str(tenant.id), **result})
