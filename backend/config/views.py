from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.views.generic import TemplateView

from apps.tenancy.permissions import get_active_membership


class PrivateAppView(TemplateView):
    template_name = "index.html"

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect("/app/login/")
        if get_active_membership(request) is None:
            return HttpResponseForbidden("An active tenant membership is required.")
        return super().dispatch(request, *args, **kwargs)
