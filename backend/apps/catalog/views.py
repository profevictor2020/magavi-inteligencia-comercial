from io import BytesIO

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenancy.permissions import TenantRolePermission

from .models import Category, IndustrySegment, Product, ProductImage
from .serializers import CategorySerializer, ProductSerializer
from .imports import CatalogImportError, confirm_preview, csv_template, preview_csv, save_preview


class TenantCatalogMixin:
    permission_classes = [TenantRolePermission]

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class CategoryListCreateView(TenantCatalogMixin, ListCreateAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(tenant=self.request.tenant)


class CategoryDetailView(TenantCatalogMixin, RetrieveUpdateAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(tenant=self.request.tenant)


class ProductListCreateView(TenantCatalogMixin, ListCreateAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return Product.objects.filter(tenant=self.request.tenant).select_related("category")


class ProductDetailView(TenantCatalogMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return Product.objects.filter(tenant=self.request.tenant).select_related("category")


class ProductImageView(APIView):
    permission_classes = [TenantRolePermission]
    parser_classes = [MultiPartParser, FormParser]

    def product(self, request, pk):
        return get_object_or_404(Product, pk=pk, tenant=request.tenant)

    def get(self, request, pk):
        product = self.product(request, pk)
        image = get_object_or_404(ProductImage, product=product)
        response = HttpResponse(bytes(image.data), content_type="image/webp")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def post(self, request, pk):
        product = self.product(request, pk)
        upload = request.FILES.get("image")
        if upload is None or upload.size > 2_000_000:
            return Response({"image": "Selecciona una imagen PNG, JPEG o WebP de hasta 2 MB."}, status=400)
        raw = upload.read(2_000_001)
        if len(raw) > 2_000_000:
            return Response({"image": "La imagen no puede superar 2 MB."}, status=400)
        try:
            with Image.open(BytesIO(raw)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"} or getattr(source, "n_frames", 1) != 1:
                    raise ValueError("Unsupported image format")
                if min(source.size) < 1 or max(source.size) > 2400:
                    raise ValueError("Unsupported dimensions")
                source.load()
                image = ImageOps.exif_transpose(source)
                image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                output = BytesIO()
                image.save(output, format="WEBP", quality=82, method=6)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            return Response({"image": "Imagen inválida. Usa PNG, JPEG o WebP de hasta 2400 píxeles por lado."}, status=400)
        if output.tell() > 2_000_000:
            return Response({"image": "La imagen procesada supera 2 MB. Prueba con otra imagen."}, status=400)
        with transaction.atomic():
            ProductImage.objects.update_or_create(product=product, defaults={"data": output.getvalue()})
            product.image_updated_at = timezone.now()
            product.save(update_fields=["image_updated_at", "updated_at"])
        return Response(ProductSerializer(product).data)

    def delete(self, request, pk):
        product = self.product(request, pk)
        with transaction.atomic():
            ProductImage.objects.filter(product=product).delete()
            product.image_updated_at = None
            product.save(update_fields=["image_updated_at", "updated_at"])
        return Response(ProductSerializer(product).data)


class PublicProductImageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, product_id):
        product = get_object_or_404(
            Product,
            pk=product_id,
            tenant=request.tenant,
            is_available=True,
            is_published=True,
            category__is_active=True,
        )
        image = get_object_or_404(ProductImage, product=product)
        response = HttpResponse(bytes(image.data), content_type="image/webp")
        response["Cache-Control"] = "public, max-age=3600"
        response["X-Content-Type-Options"] = "nosniff"
        patch_vary_headers(response, ("Host",))
        return response


class IndustrySegmentListView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        return Response([{"value": value, "label": label} for value, label in IndustrySegment.choices])


class CatalogTemplateView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request):
        response = HttpResponse(csv_template(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="plantilla-catalogo.csv"'
        return response


class CatalogImportPreviewView(APIView):
    permission_classes = [TenantRolePermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"detail": "Selecciona un archivo CSV."}, status=400)
        try:
            preview = preview_csv(uploaded_file, request.tenant)
        except CatalogImportError as exc:
            return Response({"detail": str(exc)}, status=400)
        token = None
        if preview["valid"]:
            token = save_preview(request.session, request.tenant.id, preview.pop("normalized_rows"))
        else:
            preview.pop("normalized_rows")
        return Response({**preview, "token": token})


class CatalogImportConfirmView(APIView):
    permission_classes = [TenantRolePermission]

    def post(self, request):
        token = str(request.data.get("token", ""))
        try:
            result = confirm_preview(request.session, request.tenant, token)
        except CatalogImportError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(result)
