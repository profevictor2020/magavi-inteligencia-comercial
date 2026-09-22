from rest_framework.generics import ListCreateAPIView, RetrieveUpdateAPIView, RetrieveUpdateDestroyAPIView

from apps.tenancy.permissions import TenantRolePermission

from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


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
