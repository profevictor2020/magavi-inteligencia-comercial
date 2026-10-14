"""Conservative territory matching for discovered and existing prospects."""

from .chile import normalized_location
from .models import Prospect, Territory


def matching_territory(city, region, territories):
    city_key = normalized_location(city)
    region_key = normalized_location(region)
    if city_key:
        city_matches = [territory for territory in territories if any(
            normalized_location(locality) == city_key for locality in [territory.name, *territory.localities]
        )]
        if region_key:
            regional_matches = [territory for territory in city_matches if normalized_location(territory.region) == region_key]
            if len(regional_matches) == 1:
                return regional_matches[0]
        if len(city_matches) == 1:
            return city_matches[0]
    if region_key:
        regional_matches = [territory for territory in territories if normalized_location(territory.region) == region_key]
        if len(regional_matches) == 1:
            return regional_matches[0]
    return None


def assign_unassigned_prospects(tenant):
    territories = list(Territory.objects.filter(tenant=tenant, is_active=True))
    assigned = 0
    for prospect in Prospect.objects.filter(tenant=tenant, territory__isnull=True).only("id", "city", "region"):
        territory = matching_territory(prospect.city, prospect.region, territories)
        if territory:
            Prospect.objects.filter(pk=prospect.pk, tenant=tenant, territory__isnull=True).update(territory=territory)
            assigned += 1
    return assigned
