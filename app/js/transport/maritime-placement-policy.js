// Mapped facilities constrain generated activity; a generic pier does not
// establish a cargo terminal, a ferry service or a research base.
const ROLES = Object.freeze({
  runabout: ['marina', 'mooring', 'pier'],
  sailboat: ['marina', 'mooring'],
  workboat: ['pier', 'quay', 'dock', 'port', 'harbour'],
  tug: ['port', 'dock'],
  ferry: ['ferry_terminal', 'ferry_route'],
  research: ['port', 'dock'],
  cargo: ['port']
});

export function maritimeFacilitySupportsVessel(record, catalog) {
  if (!ROLES[catalog?.role]?.includes(record?.type)) return false;
  if (['no', 'private', 'military'].includes(String(record.access).toLowerCase())) return false;
  // A bounding-box centre/generalized feature must not authorize a 210 m ship.
  if (catalog.role === 'cargo') return record.exactPhysicalGeometry === true;
  return true;
}

export function selectMaritimeAnchor(anchors, catalog) {
  return anchors.find(record => maritimeFacilitySupportsVessel(record, catalog)) || null;
}
