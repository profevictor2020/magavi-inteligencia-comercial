from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Membership


def get_active_membership(request):
    if not request.user or not request.user.is_authenticated or request.tenant is None:
        return None
    if not hasattr(request, "_tenant_membership"):
        request._tenant_membership = (
            Membership.objects.filter(
                tenant=request.tenant,
                user=request.user,
                is_active=True,
                tenant__is_active=True,
            )
            .select_related("tenant", "user")
            .first()
        )
    return request._tenant_membership


class HasTenantMembership(BasePermission):
    message = "An active membership for this tenant is required."

    def has_permission(self, request, view):
        return get_active_membership(request) is not None

    def has_object_permission(self, request, view, obj):
        tenant_id = getattr(obj, "tenant_id", getattr(obj, "id", None))
        return get_active_membership(request) is not None and tenant_id == request.tenant.id


class TenantRolePermission(HasTenantMembership):
    message = "Your tenant role does not allow this action."
    write_roles = {Membership.Role.OWNER, Membership.Role.ADMIN}

    def has_permission(self, request, view):
        membership = get_active_membership(request)
        if membership is None:
            return False
        return request.method in SAFE_METHODS or membership.role in self.write_roles
