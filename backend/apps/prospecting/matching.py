from django.db import transaction

from apps.catalog.models import Product

from .models import Opportunity, Prospect


SCORE_VERSION = "rules-v1"


def _normalized(value):
    return value.casefold().strip()


def score_product_for_prospect(product, prospect):
    haystack = _normalized(
        " ".join(
            filter(
                None,
                [prospect.name, prospect.industry, prospect.notes, prospect.city, prospect.region],
            )
        )
    )
    industries = [_normalized(item) for item in product.target_industries]
    keywords = [_normalized(item) for item in product.match_keywords]
    industry_match = bool(
        prospect.industry
        and any(target in _normalized(prospect.industry) or _normalized(prospect.industry) in target for target in industries)
    )
    matched_keywords = [keyword for keyword in keywords if keyword and keyword in haystack]

    # A recommendation needs at least one commercial relevance signal. Contact
    # quality or location alone must never manufacture an opportunity.
    if not industry_match and not matched_keywords:
        return None

    breakdown = {
        "industry": 35 if industry_match else 0,
        "keywords": round(25 * len(matched_keywords) / len(keywords)) if keywords else 0,
        "territory": 15 if prospect.territory_id else 0,
        "contact": 10 if prospect.email or prospect.phone else 0,
        "data_quality": 10 if prospect.website and prospect.verified_at else 5 if prospect.website or prospect.verified_at else 0,
        "priority": 5 if product.commercial_priority == Product.CommercialPriority.HIGH else 0,
    }
    score = min(100, sum(breakdown.values()))
    reasons = []
    if industry_match:
        reasons.append(f"el rubro {prospect.industry} coincide con el segmento objetivo")
    if matched_keywords:
        reasons.append(f"coinciden las señales {', '.join(matched_keywords)}")
    if prospect.territory_id:
        reasons.append(f"está asignado al territorio {prospect.territory.name}")
    if prospect.email or prospect.phone:
        reasons.append("dispone de un canal de contacto")
    return {
        "score": score,
        "score_breakdown": breakdown,
        "explanation": "Se recomienda porque " + "; ".join(reasons) + ".",
    }


@transaction.atomic
def generate_opportunities(tenant):
    products = Product.objects.filter(
        tenant=tenant, is_available=True, category__is_active=True
    ).select_related("category")
    prospects = Prospect.objects.filter(tenant=tenant).exclude(status=Prospect.Status.DISCARDED).select_related("territory")
    active_pairs = set()
    created = updated = 0
    for prospect in prospects:
        for product in products:
            result = score_product_for_prospect(product, prospect)
            if result is None:
                continue
            active_pairs.add((prospect.id, product.id))
            _, was_created = Opportunity.objects.update_or_create(
                tenant=tenant,
                prospect=prospect,
                product=product,
                defaults={**result, "score_version": SCORE_VERSION},
            )
            created += int(was_created)
            updated += int(not was_created)

    stale = Opportunity.objects.filter(tenant=tenant, status=Opportunity.Status.PENDING)
    stale_ids = [item.id for item in stale if (item.prospect_id, item.product_id) not in active_pairs]
    removed, _ = Opportunity.objects.filter(id__in=stale_ids).delete()
    return {"created": created, "updated": updated, "removed": removed, "total": len(active_pairs)}
