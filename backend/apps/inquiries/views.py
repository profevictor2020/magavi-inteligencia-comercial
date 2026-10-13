from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import CreateAPIView, ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.tenancy.models import Tenant
from apps.tenancy.permissions import TenantRolePermission

from .models import Quote, QuoteItem, QuoteRequest
from .serializers import PrivateQuoteRequestSerializer, PublicQuoteRequestSerializer, QuoteDraftSerializer, QuoteFollowUpSerializer, QuoteSerializer


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
        return QuoteRequest.objects.filter(tenant=self.request.tenant).prefetch_related("items", "quote__items")


class QuoteRequestDetailView(RetrieveUpdateAPIView):
    serializer_class = PrivateQuoteRequestSerializer
    permission_classes = [TenantRolePermission]

    def get_queryset(self):
        return QuoteRequest.objects.filter(tenant=self.request.tenant).prefetch_related("items", "quote__items")


class QuoteView(APIView):
    permission_classes = [TenantRolePermission]

    def source(self, request, pk, lock=False):
        queryset = QuoteRequest.objects.filter(tenant=request.tenant).prefetch_related("items")
        if lock:
            queryset = queryset.select_for_update()
        return get_object_or_404(queryset, pk=pk)

    def get(self, request, pk):
        source = self.source(request, pk)
        quote = get_object_or_404(Quote.objects.prefetch_related("items"), request=source, tenant=request.tenant)
        return Response(QuoteSerializer(quote).data)

    def save_draft(self, request, pk, create):
        with transaction.atomic():
            source = self.source(request, pk, lock=True)
            quote = Quote.objects.filter(request=source, tenant=request.tenant).first()
            if create and quote is not None:
                return Response({"detail": "La solicitud ya tiene una cotización."}, status=status.HTTP_409_CONFLICT)
            if not create and quote is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            if quote is not None and quote.status != Quote.Status.DRAFT:
                return Response({"detail": "Una cotización emitida no se puede modificar."}, status=status.HTTP_409_CONFLICT)
            serializer = QuoteDraftSerializer(data=request.data, context={"quote_request": source})
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            if create:
                Tenant.objects.select_for_update().get(pk=request.tenant.pk)
                last_number = Quote.objects.filter(tenant=request.tenant).aggregate(Max("number"))["number__max"] or 0
                quote = Quote.objects.create(tenant=request.tenant, request=source, number=last_number + 1,
                                             valid_until=data["valid_until"], tax_rate=data["tax_rate"], notes=data.get("notes", ""))
            else:
                quote.valid_until = data["valid_until"]
                quote.tax_rate = data["tax_rate"]
                quote.notes = data.get("notes", "")
                quote.save(update_fields=["valid_until", "tax_rate", "notes", "updated_at"])
                quote.items.all().delete()
            QuoteItem.objects.bulk_create([
                QuoteItem(quote=quote, request_item=data["source_items"][item["request_item"]],
                          product_name=data["source_items"][item["request_item"]].product_name,
                          product_sku=data["source_items"][item["request_item"]].product_sku,
                          quantity=data["source_items"][item["request_item"]].quantity,
                          unit_price=item["unit_price"])
                for item in data["items"]
            ])
            quote = Quote.objects.prefetch_related("items").get(pk=quote.pk)
            return Response(QuoteSerializer(quote).data, status=status.HTTP_201_CREATED if create else status.HTTP_200_OK)

    def post(self, request, pk):
        return self.save_draft(request, pk, create=True)

    def patch(self, request, pk):
        return self.save_draft(request, pk, create=False)


class QuoteIssueView(APIView):
    permission_classes = [TenantRolePermission]

    def post(self, request, pk):
        with transaction.atomic():
            source = get_object_or_404(QuoteRequest.objects.filter(tenant=request.tenant).select_for_update(), pk=pk)
            quote = get_object_or_404(Quote.objects.prefetch_related("items"), request=source, tenant=request.tenant)
            if quote.status != Quote.Status.DRAFT:
                return Response({"detail": "La cotización ya fue emitida."}, status=status.HTTP_409_CONFLICT)
            if quote.valid_until < timezone.localdate():
                return Response({"detail": "La vigencia de la cotización terminó."}, status=status.HTTP_400_BAD_REQUEST)
            quote.status = Quote.Status.ISSUED
            quote.issued_at = timezone.now()
            quote.save(update_fields=["status", "issued_at", "updated_at"])
            return Response(QuoteSerializer(quote).data)


class QuoteFollowUpView(APIView):
    permission_classes = [TenantRolePermission]

    def patch(self, request, pk):
        with transaction.atomic():
            quote = get_object_or_404(
                Quote.objects.select_for_update().prefetch_related("items"),
                request_id=pk, tenant=request.tenant,
            )
            if quote.status != Quote.Status.ISSUED:
                return Response({"detail": "Emite la cotización antes de registrar seguimiento."}, status=status.HTTP_409_CONFLICT)
            serializer = QuoteFollowUpSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            previous_status = quote.follow_up_status
            quote.follow_up_status = data.get("follow_up_status", previous_status)
            quote.next_contact_on = data.get("next_contact_on", quote.next_contact_on)
            quote.follow_up_notes = data.get("follow_up_notes", quote.follow_up_notes)
            now = timezone.now()
            if quote.follow_up_status == Quote.FollowUpStatus.SENT and previous_status != Quote.FollowUpStatus.SENT and quote.sent_at is None:
                quote.sent_at = now
            if quote.follow_up_status in {Quote.FollowUpStatus.ACCEPTED, Quote.FollowUpStatus.REJECTED}:
                quote.next_contact_on = None
                if previous_status != quote.follow_up_status:
                    quote.responded_at = now
            elif previous_status in {Quote.FollowUpStatus.ACCEPTED, Quote.FollowUpStatus.REJECTED}:
                quote.responded_at = None
            quote.save(update_fields=["follow_up_status", "next_contact_on", "follow_up_notes", "sent_at", "responded_at", "updated_at"])
            return Response(QuoteSerializer(quote).data)


class QuotePrintView(APIView):
    permission_classes = [TenantRolePermission]

    def get(self, request, pk):
        source = get_object_or_404(QuoteRequest.objects.filter(tenant=request.tenant), pk=pk)
        quote = get_object_or_404(Quote.objects.select_related("tenant", "request").prefetch_related("items"), request=source, tenant=request.tenant)
        if quote.status != Quote.Status.ISSUED:
            return Response({"detail": "Emite la cotización antes de imprimirla."}, status=status.HTTP_409_CONFLICT)
        html = render_to_string("inquiries/quote.html", {"quote": quote, "source": source})
        response = HttpResponse(html, content_type="text/html; charset=utf-8")
        response["Cache-Control"] = "private, no-store"
        return response
