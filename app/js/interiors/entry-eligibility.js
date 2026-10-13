// Shared semantic gate for visible facade doors and interior admission.
// This does not change exterior geometry, transport surfaces or collision.
const EXCLUDED_TYPES = new Set([
  'roof', 'canopy', 'awning', 'carport', 'balcony', 'bridge',
  'bridge_structure', 'bridge_guardrail'
]);
const EXCLUDED_PARTS = new Set(['roof', 'canopy', 'balcony']);
const MINIMUM_BODY_HEIGHT_METERS = 2.4;

export function canContainWalkableInterior(building) {
  if (!building || building.isInteriorCollider || building.collisionDisabled || building.collisionKind === 'barrier') return false;
  if (EXCLUDED_TYPES.has(String(building.buildingType || '').trim().toLowerCase())) return false;
  if (EXCLUDED_PARTS.has(String(building.buildingPartKind || '').trim().toLowerCase())) return false;
  // A roof can have a large absolute elevation while its actual body is only
  // centimetres thick. Never use the roof top or foundation to invent rooms.
  // Legacy records with no body measurement retain their existing admission.
  if (Number.isFinite(building.bodyHeightMeters) && building.bodyHeightMeters < MINIMUM_BODY_HEIGHT_METERS) return false;
  return true;
}
