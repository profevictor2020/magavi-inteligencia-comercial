import os
from datetime import timedelta

from django.db.models import Count, Q
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from apps.tenancy.models import Tenant
from apps.tenancy.permissions import TenantRolePermission

from .discovery import DiscoveryError, configured, mindcase_poll_interval, run_tenant_discovery
from .chile import REGIONS
from .matching import generate_opportunities
from .models import DiscoveryEvaluation, DiscoveryJob, DiscoveryRun, Opportunity, Prospect, Territory
from .google_places import PlacesProviderError
from .place_categories import CATEGORY_FAMILIES
from .places_search import daily_limit, searches_today, serialize_job, start_places_search
from .serializers import OpportunitySerializer, ProspectSerializer, TerritorySerializer
from .territory_matching import assign_unassigned_prospects


class TerritoryMixin:
    permission_classes = [TenantRolePermission]
    serializer_class = TerritorySerializer

    def get_queryset(self):
        return Territory.objects.filter(tenant=self.request.tenant).annotate(
            prospect_count=Count("prospects", distinct=True),
            reviewed_count=Count("prospects", filter=Q(prospects__status=Prospect.Status.REVIEWED), distinct=True),
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            territory = serializer.save(tenant=self.request.tenant)
            assigned = assign_unassigned_prospects(self.request.tenant)
            if assigned:
                generate_opportunities(self.request.tenant)
            self._set_counts(territory)

    def perform_update(self, serializer):
        with transaction.atomic():
            territory = serializer.save()
            assigned = assign_unassigned_prospects(self.request.tenant)
            if assigned:
                generate_opportunities(self.request.tenant)
            self._set_counts(territory)

    @staticmethod
    def _set_counts(territory):
        territory.prospect_count = Prospect.objects.filter(territory=territory).count()
        territory.reviewed_count = Prospect.objects.filter(territory=territory, status=Prospect.Status.REVIEWED).count()


class TerritoryListCreateView(TerritoryMixin, ListCreateAPIView):
    pass


class TerritoryDetailView(TerritoryMixin, RetrieveUpdateDestroyAPIView):
    pass


class ChileanRegionListView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        return Response([{"name": name, "localities": list(localities)} for name, localities in REGIONS])


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


class PlacesSearchView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        jobs = (DiscoveryJob.objects.filter(tenant=request.tenant)
                .prefetch_related("observations")[:20])
        return Response({
            "configured": bool(os.getenv("MINDCASE_API_KEY")),
            "daily_limit": daily_limit(), "searches_today": searches_today(request.tenant),
            "categories": [{"code": code, "label": rule["label"]}
                           for code, rule in CATEGORY_FAMILIES.items()],
            "jobs": [serialize_job(job) for job in jobs],
        })

    def post(self, request):
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "La búsqueda debe ser un objeto JSON."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            job, cached = start_places_search(
                request.tenant, data.get("territory"), keywords=data.get("keywords"),
                locality=data.get("locality"), category_families=data.get("category_families"),
            )
        except PlacesProviderError as error:
            return Response({"detail": str(error)}, status=status.HTTP_409_CONFLICT)
        return Response({"cached": cached, "job": serialize_job(job)},
                        status=status.HTTP_200_OK if cached or job.status == DiscoveryJob.Status.COMPLETED
                        else status.HTTP_502_BAD_GATEWAY)


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
        next_poll_at = None
        if run and run.status == DiscoveryRun.Status.PENDING and run.mindcase_job_id:
            last_check = run.mindcase_last_polled_at or run.mindcase_submitted_at
            if last_check:
                next_poll_at = last_check + mindcase_poll_interval()
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
            "mindcase_job_id": run.mindcase_job_id if run else "",
            "mindcase_next_poll_at": next_poll_at,
        })

    def patch(self, request):
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return Response({"enabled": "Indica true o false."}, status=status.HTTP_400_BAD_REQUEST)
        run, _ = DiscoveryRun.objects.get_or_create(tenant=request.tenant)
        if enabled and run.mindcase_submission_attempted and not run.mindcase_job_id and run.status == DiscoveryRun.Status.FAILED:
            return Response({"detail": "Mindcase no confirmó el ID de la ejecución anterior. Revisa el historial antes de reactivar."}, status=status.HTTP_409_CONFLICT)
        run.enabled = enabled
        run.save(update_fields=["enabled"])
        return self.get(request)


class DiscoveryEvaluationListView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        try:
            offset = max(0, int(request.query_params.get("offset", "0")))
        except ValueError:
            return Response({"offset": "Debe ser un número entero."}, status=status.HTTP_400_BAD_REQUEST)
        offset = min(offset, 10000)
        queryset = DiscoveryEvaluation.objects.filter(tenant=request.tenant).order_by("-evaluated_at", "username")
        rows = queryset[offset:offset + 24]
        return Response({
            "total": queryset.count(),
            "results": [{"id": str(row.id), "batch_id": str(row.batch_id), "username": row.username,
                         "name": row.name, "search_term": row.search_term, "decision": row.decision,
                         "score": row.score, "reason": row.reason, "evaluated_at": row.evaluated_at}
                        for row in rows],
        })


class ManualDiscoveryView(APIView):
    permission_classes = [TenantRolePermission]

    def post(self, request):
        if not configured():
            return Response({"detail": "Faltan credenciales para Instagram o IA."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        run = DiscoveryRun.objects.filter(tenant=request.tenant).first()
        if not run or not run.enabled:
            return Response({"detail": "Activa la búsqueda automática antes de probarla."}, status=status.HTTP_409_CONFLICT)
        if run.mindcase_submission_attempted and not run.mindcase_job_id:
            return Response({"detail": "Mindcase no confirmó el ID de la ejecución anterior. Revisa su historial antes de probar otra vez."}, status=status.HTTP_409_CONFLICT)
        if run.status in (DiscoveryRun.Status.RUNNING, DiscoveryRun.Status.PENDING):
            return Response({"detail": "Ya hay una búsqueda en curso. Esta prueba no iniciará otra."}, status=status.HTTP_409_CONFLICT)
        if run.finished_at and timezone.now() - run.finished_at < timedelta(minutes=5):
            return Response({"detail": "Espera cinco minutos desde la última búsqueda antes de iniciar otra prueba."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        try:
            result = run_tenant_discovery(request.tenant, force=True)
        except DiscoveryError:
            return Response({"detail": "La búsqueda falló; revisa el estado en Prospectos."}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            return Response({"detail": "La búsqueda falló; revisa los registros del servidor."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(result)


class DiscoveryPollView(APIView):
    permission_classes = [TenantRolePermission]

    def post(self, request):
        run = DiscoveryRun.objects.filter(tenant=request.tenant).first()
        if not run or run.status != DiscoveryRun.Status.PENDING or not run.mindcase_job_id:
            return Response({"detail": "No hay un job pendiente para consultar."}, status=status.HTTP_409_CONFLICT)
        try:
            result = run_tenant_discovery(request.tenant)
        except DiscoveryError:
            return Response({"detail": "No se pudo consultar Mindcase; revisa el estado en Prospectos."}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            return Response({"detail": "No se pudo consultar Mindcase; revisa los registros del servidor."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(result)


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
        poll_cutoff = timezone.now() - mindcase_poll_interval()
        tenant = (Tenant.objects.filter(is_active=True)
                  .filter(discovery_run__enabled=True)
                  .exclude(discovery_run__status=DiscoveryRun.Status.RUNNING, discovery_run__started_at__gte=timezone.now() - timedelta(minutes=10))
                  .filter(Q(discovery_run__mindcase_job_id="") | Q(discovery_run__mindcase_last_polled_at__isnull=True)
                          | Q(discovery_run__mindcase_last_polled_at__lte=poll_cutoff))
                  .filter(Q(discovery_run__status__in=[DiscoveryRun.Status.FAILED, DiscoveryRun.Status.SKIPPED])
                          | Q(discovery_run__finished_at__isnull=True) | Q(discovery_run__finished_at__lt=cutoff))
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
