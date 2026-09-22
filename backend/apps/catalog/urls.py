from django.urls import path

from .views import CategoryDetailView, CategoryListCreateView, ProductDetailView, ProductListCreateView

urlpatterns = [
    path("categories/", CategoryListCreateView.as_view(), name="catalog-category-list"),
    path("categories/<uuid:pk>/", CategoryDetailView.as_view(), name="catalog-category-detail"),
    path("products/", ProductListCreateView.as_view(), name="catalog-product-list"),
    path("products/<uuid:pk>/", ProductDetailView.as_view(), name="catalog-product-detail"),
]
