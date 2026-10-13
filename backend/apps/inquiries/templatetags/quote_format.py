from decimal import Decimal, ROUND_HALF_UP

from django import template

register = template.Library()


@register.filter
def clp(value):
    """Format a stored amount with Chilean separators without hiding real cents."""
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    pesos, cents = f"{amount:,.2f}".split(".")
    pesos = pesos.replace(",", ".")
    return f"${pesos}" if cents == "00" else f"${pesos},{cents}"


@register.filter
def percentage_cl(value):
    amount = f"{Decimal(str(value)):.2f}".rstrip("0").rstrip(".")
    return amount.replace(".", ",")
