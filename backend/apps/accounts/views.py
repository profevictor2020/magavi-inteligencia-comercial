from django.contrib.auth import authenticate, get_user_model, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.tenancy.permissions import get_active_membership

from .serializers import LoginSerializer

INVALID_CREDENTIALS = "No fue posible iniciar sesión con los datos proporcionados."


def session_payload(request) -> dict:
    membership = get_active_membership(request)
    if membership is None:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user": {
            "id": request.user.pk,
            "email": request.user.email,
            "name": request.user.get_full_name() or request.user.username,
        },
        "tenant": {
            "id": str(membership.tenant_id),
            "name": membership.tenant.name,
            "role": membership.role,
        },
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        payload = session_payload(request)
        payload["csrf_token"] = get_token(request)
        response = Response(payload)
        response["Cache-Control"] = "no-store"
        return response


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if request.tenant is None:
            return Response({"detail": INVALID_CREDENTIALS}, status=400)

        user_model = get_user_model()
        user = user_model.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        authenticated_user = None
        if user is not None:
            authenticated_user = authenticate(
                request,
                username=user.get_username(),
                password=serializer.validated_data["password"],
            )

        if authenticated_user is None:
            return Response({"detail": INVALID_CREDENTIALS}, status=400)

        membership = authenticated_user.memberships.filter(
            tenant=request.tenant,
            tenant__is_active=True,
            is_active=True,
        ).first()
        if membership is None:
            return Response({"detail": INVALID_CREDENTIALS}, status=400)

        login(request, authenticated_user)
        request._tenant_membership = membership
        response = Response(session_payload(request))
        response["Cache-Control"] = "no-store"
        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        response = Response({"authenticated": False})
        response["Cache-Control"] = "no-store"
        return response
