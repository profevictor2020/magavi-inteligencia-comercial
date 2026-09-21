from .resolution import resolve_tenant_from_request


class TenantResolutionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        resolution = resolve_tenant_from_request(request)
        request.tenant = resolution.tenant
        request.tenant_domain = resolution.domain
        return self.get_response(request)
