from decimal import Decimal, ROUND_HALF_UP

from django import template

register = template.Library()


@register.filter
def clp(value):
    """Format a quotation amount as whole Chilean pesos."""
    amount = Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"${amount:,.0f}".replace(",", ".")


@register.filter
def percentage_cl(value):
    amount = f"{Decimal(str(value)):.2f}".rstrip("0").rstrip(".")
    return amount.replace(".", ",")
