from dataclasses import dataclass

from django.http import HttpRequest

from .models import Tenant, TenantDomain


@dataclass(frozen=True)
class TenantResolution:
    tenant: Tenant | None
    domain: TenantDomain | None


def normalize_hostname(host: str) -> str:
    value = host.strip().rstrip(".").lower()
    if value.startswith("["):
        return value.split("]", 1)[0].lstrip("[")
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def resolve_tenant_from_request(request: HttpRequest) -> TenantResolution:
    hostname = normalize_hostname(request.get_host())

    domain = (
        TenantDomain.objects.select_related("tenant")
        .filter(
            hostname__iexact=hostname,
            is_active=True,
            is_verified=True,
            tenant__is_active=True,
        )
        .first()
    )
    if domain is None:
        return TenantResolution(tenant=None, domain=None)
    return TenantResolution(tenant=domain.tenant, domain=domain)
