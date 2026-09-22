from django.http import HttpResponse
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenancy.permissions import TenantRolePermission

from .models import Category, Product
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
