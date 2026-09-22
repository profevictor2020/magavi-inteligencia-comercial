from django.utils.cache import patch_vary_headers
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tenant
from .permissions import TenantRolePermission
from .serializers import PublicTenantLandingSerializer, TenantPrivateSerializer

DEMO_LANDING = {
    "name": "Empresa demostrativa",
    "description": "Un espacio demostrativo de MAGAVI sin datos comerciales reales.",
    "headline": "Descubre una experiencia comercial preparada para tu empresa.",
    "logo_path": "/static/demo/default-company.svg",
    "theme": {"primary": "#0D766E", "secondary": "#F4BC57"},
    "contact": {"email": "", "phone": ""},
    "featured_offerings": [
        {"name": "Servicio demostrativo", "description": "Contenido sintético para validar la plataforma."},
    ],
    "products": [],
    "is_demo": True,
}


class PublicLandingView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if request.tenant is None:
            response = Response(DEMO_LANDING)
        else:
            response = Response(PublicTenantLandingSerializer(request.tenant).data)
        response["Cache-Control"] = "no-store"
        patch_vary_headers(response, ("Host",))
        return response


class TenantDetailView(RetrieveUpdateAPIView):
    serializer_class = TenantPrivateSerializer
    permission_classes = [TenantRolePermission]
    lookup_field = "id"
    lookup_url_kwarg = "tenant_id"

    def get_queryset(self):
        if self.request.tenant is None:
            return Tenant.objects.none()
        return Tenant.objects.filter(id=self.request.tenant.id, is_active=True)


class TenantContextView(RetrieveUpdateAPIView):
    serializer_class = TenantPrivateSerializer
    permission_classes = [TenantRolePermission]

    def get_object(self):
        self.check_object_permissions(self.request, self.request.tenant)
        return self.request.tenant
