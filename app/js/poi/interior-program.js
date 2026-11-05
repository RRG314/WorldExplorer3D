// Visitability is independent of commerce capabilities. A furnished café does
// not gain a wallet, purchase or health action merely by being enterable.
export function poiInteriorProgram(tags = {}) {
  const amenity = String(tags.amenity || '').toLowerCase(),
    shop = String(tags.shop || '').toLowerCase(),
    tourism = String(tags.tourism || '').toLowerCase();
  if (
    ['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub', 'ice_cream'].includes(amenity)
  )
    return 'food-service';
  if (['hotel', 'motel', 'hostel', 'guest_house'].includes(tourism)) return 'hotel-lobby';
  if (
    ['hospital', 'clinic', 'doctors', 'pharmacy', 'veterinary'].includes(amenity) ||
    tags.healthcare
  )
    return 'medical-service';
  if (amenity === 'bank') return 'banking';
  if (amenity === 'post_office') return 'postal';
  if (['school', 'university', 'college', 'kindergarten'].includes(amenity)) return 'education';
  if (amenity === 'library') return 'library';
  if (['police', 'fire_station', 'townhall', 'courthouse', 'community_centre'].includes(amenity))
    return 'civic-service';
  if (['museum', 'gallery', 'attraction', 'aquarium', 'information'].includes(tourism))
    return 'visitor-gallery';
  if (['car_repair', 'car_parts', 'tyres'].includes(shop)) return 'automotive-service';
  if (shop) return 'general-retail';
  if (tags.office) return 'office';
  return '';
}

export function interiorProgramForDefinition(definition = {}) {
  if (
    definition.accessDenied ||
    definition.communityRealityCapture ||
    definition.authoredLayout ||
    definition.curatedContent ||
    definition.aquariumContent ||
    definition.cernContent ||
    definition.facilityContent
  )
    return '';
  const support = definition.support || {};
  const named =
    support.interiorArchetype ||
    support.poiTenancies?.find((p) => p.semantic?.interiorArchetype)?.semantic.interiorArchetype;
  if (named) return named;
  const building = definition.building || support.building || {};
  const tags = building.tags || {};
  const explicit = poiInteriorProgram(tags);
  if (explicit) return explicit;
  const type = String(building.buildingType || '').toLowerCase();
  if (/office|commercial/.test(type)) return 'office';
  if (/retail/.test(type)) return 'general-retail';
  if (/hotel/.test(type)) return 'hotel-lobby';
  if (/school|university/.test(type)) return 'education';
  if (/hospital|clinic/.test(type)) return 'medical-service';
  if (/industrial|garage|workshop/.test(type)) return 'automotive-service';
  return '';
}

export function selectPoiTenancy(
  tenants = [],
  { destinationId = '', navigation, world, entrance } = {}
) {
  const exact = destinationId && tenants.find((p) => p.id === destinationId);
  if (exact) return exact;
  const x = entrance?.approachX ?? entrance?.x,
    z = entrance?.approachZ ?? entrance?.z;
  if (
    navigation?.owner === 'poi' &&
    navigation.world === world &&
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.hypot(navigation.x - x, navigation.z - z) < 3
  ) {
    const named = tenants.find((p) => p.source?.name === navigation.label);
    if (named) return named;
  }
  return tenants.find((p) => p.semantic?.interiorArchetype) || tenants[0] || null;
}
