from io import BytesIO

from django.http import HttpResponse
from django.db import transaction
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tenant, TenantLogo
from .permissions import TenantOwnerPermission, TenantRolePermission
from .serializers import PublicTenantLandingSerializer, TenantPrivateSerializer

MAX_LOGO_BYTES = 2_000_000
MAX_LOGO_DIMENSION = 2_400

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


class PublicLogoView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        tenant = request.tenant
        if tenant is None or not tenant.logo_updated_at:
            return Response(status=status.HTTP_404_NOT_FOUND)
        logo = TenantLogo.objects.filter(tenant=tenant).first()
        if logo is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(bytes(logo.data), content_type="image/png")
        response["Cache-Control"] = "public, max-age=3600"
        response["X-Content-Type-Options"] = "nosniff"
        patch_vary_headers(response, ("Host",))
        return response


class TenantLogoView(APIView):
    permission_classes = [TenantOwnerPermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get("logo")
        if upload is None:
            return Response({"logo": "Selecciona una imagen PNG, JPEG o WebP."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_LOGO_BYTES:
            return Response({"logo": "El logo debe pesar menos de 2 MB."}, status=status.HTTP_400_BAD_REQUEST)
        raw = upload.read(MAX_LOGO_BYTES + 1)
        if len(raw) > MAX_LOGO_BYTES:
            return Response({"logo": "El logo debe pesar menos de 2 MB."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with Image.open(BytesIO(raw)) as image:
                if image.format not in {"PNG", "JPEG", "WEBP"} or getattr(image, "n_frames", 1) != 1:
                    raise ValueError("Unsupported image format")
                if max(image.size) > MAX_LOGO_DIMENSION or min(image.size) < 1:
                    raise ValueError("Unsupported image dimensions")
                image.load()
                image = ImageOps.exif_transpose(image)
                image.thumbnail((640, 640), Image.Resampling.LANCZOS)
                normalized = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                output = BytesIO()
                normalized.save(output, format="PNG", optimize=True)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            return Response({"logo": "La imagen no es válida. Usa PNG, JPEG o WebP de hasta 2400 píxeles por lado."}, status=status.HTTP_400_BAD_REQUEST)
        if output.tell() > MAX_LOGO_BYTES:
            return Response({"logo": "La imagen procesada excede 2 MB. Usa un logo más simple."}, status=status.HTTP_400_BAD_REQUEST)
        tenant = request.tenant
        with transaction.atomic():
            TenantLogo.objects.update_or_create(tenant=tenant, defaults={"data": output.getvalue()})
            tenant.logo_updated_at = timezone.now()
            tenant.save(update_fields=["logo_updated_at", "updated_at"])
        return Response(TenantPrivateSerializer(tenant, context={"request": request}).data)

    def delete(self, request):
        tenant = request.tenant
        with transaction.atomic():
            TenantLogo.objects.filter(tenant=tenant).delete()
            tenant.logo_updated_at = None
            tenant.save(update_fields=["logo_updated_at", "updated_at"])
        return Response(TenantPrivateSerializer(tenant, context={"request": request}).data)


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
