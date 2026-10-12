// Curated content describes a representation, never a building or permission.
// Keep this contract independent of DOM, network, scene and persistence owners.
export const INTERIOR_CONTENT_VERSION = 1;
const KINDS = new Set(['representative', 'licensed-authored', 'exhibit-only', 'interpretive']);
const LICENSES = new Set(['CC0-1.0', 'CC-BY-4.0', 'MIT']);
const ID = /^[a-z0-9][a-z0-9:._-]{0,99}$/;
const SHA = /^[a-f0-9]{64}$/;
const fail = message => { throw new TypeError(`Interior content: ${message}`); };

// Venue identity is independent of reconstruction accuracy. An interpretive
// aquarium is still an aquarium; it must never enter the museum fit/decorator.
// Additional venue types need their own reviewed content and scene contracts.
export function isMuseumContent(content) {
  return content?.venueType === 'museum';
}
function text(value, limit, field) {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value : fail(`invalid ${field}`);
}
function id(value) { return typeof value === 'string' && ID.test(value) ? value : fail('invalid stable ID'); }
function https(value) {
  let url; try { url = new URL(value); } catch { fail('invalid evidence URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail('evidence must use public HTTPS');
  return url.href;
}
function number(value, minimum, maximum, field) {
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fail(`invalid ${field}`);
}
export function validateInteriorContent(input) {
  if (input?.schemaVersion !== INTERIOR_CONTENT_VERSION) fail('unsupported manifest version');
  id(input.id); text(input.version, 40, 'content version');
  if (!isMuseumContent(input)) fail('museum content requires an explicit museum venue type');
  if (!KINDS.has(input.kind)) fail('unsupported representation');
  text(input.title, 100, 'title'); text(input.accuracyLabel, 260, 'accuracy label');
  if(input.layoutProfile){if(input.layoutProfile!=='peale-front-ground-v1')fail('unreviewed layout profile');https(input.layoutEvidence);}
  if (input.review?.status !== 'approved' || !input.review.date || !input.review.evidence) fail('unreviewed content');
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 32) fail('source inventory required');
  const sources = new Set();
  for (const source of input.sources) {
    id(source.id); if (sources.has(source.id)) fail('duplicate source'); sources.add(source.id);
    if (!LICENSES.has(source.license)) fail('unsupported or uncertain asset rights');
    text(source.author, 200, 'creator'); https(source.url); https(source.rightsEvidence);
    if (!SHA.test(source.sha256)) fail('source bytes must be pinned');
    text(source.modifications, 600, 'modifications');
  }
  if (!Array.isArray(input.exhibits) || input.exhibits.length < 1 || input.exhibits.length > 24) fail('invalid exhibit count');
  const exhibits = new Set();
  for (const exhibit of input.exhibits) {
    id(exhibit.id); if (exhibits.has(exhibit.id)) fail('duplicate exhibit'); exhibits.add(exhibit.id);
    if (!sources.has(exhibit.sourceId)) fail('exhibit has no reviewed source');
    id(exhibit.assetId); text(exhibit.title, 140, 'exhibit title'); text(exhibit.description, 1600, 'exhibit description');
    text(exhibit.collection, 200, 'collection'); text(exhibit.period, 120, 'period');
    number(exhibit.displayExtentMeters, .1, 8, 'display extent');
    number(exhibit.interactionRangeMeters, .8, 3, 'interaction range');
    if (!['sculpture', 'artwork'].includes(exhibit.presentation)) fail('unsupported exhibit presentation');
    number(exhibit.roomIndex, 0, 7, 'room index');
    if (!Number.isInteger(exhibit.roomIndex)) fail('room index must be integral');
  }
  if (input.association?.kind !== 'mapped-building' || !Array.isArray(input.association.sourceIds) || !input.association.sourceIds.length) fail('mapped association required');
  for (const sourceId of input.association.sourceIds) text(sourceId, 180, 'building source ID');
  const ring = input.association.footprint;
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > 128) fail('source footprint required');
  ring.forEach(point => { number(point.lat, -90, 90, 'latitude'); number(point.lon, -180, 180, 'longitude'); });
  if (!input.association.footprintSource || !input.association.revision) fail('footprint provenance required');
  https(input.association.footprintSource);
  return input;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}
const edgeDistance = (point, ring) => Math.min(...ring.map((p, i) => distanceToSegment(point, p, ring[(i + 1) % ring.length])));
const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p.x * q.z - q.x * p.z;
}, 0)) / 2;

export function matchInteriorBuilding(content, support, geoToWorld, metersPerUnit = 1) {
  if (!isMuseumContent(content)) return null;
  if (!support?.enterable || support.synthetic || !support.building || typeof geoToWorld !== 'function') return null;
  const building = support.building, provenance = building.buildingProvenance;
  if (provenance?.valid === false || (building.buildingPartKind && building.buildingPartKind !== 'full') || building.allowsPassageBelow) return null;
  const identities = [support.key, building.sourceBuildingId];
  // A nearest POI, display name, address or centre coordinate cannot authorize
  // cultural content. A metadata identity also needs its authoritative mapping.
  if (provenance?.metadata?.stable === true) identities.push(provenance.metadata.sourceFeatureId);
  const identity = content.association.sourceIds.find(value => identities.includes(value));
  if (!identity) return null;
  const actual = building.pts, expected = content.association.footprint.map(p => geoToWorld(p.lat, p.lon));
  const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
  if (!Array.isArray(actual) || actual.length < 3 || !actual.every(finite) || !expected.every(finite) || !(metersPerUnit > 0)) return null;
  // Compare edges in both directions, including their midpoints. This admits
  // small surveyed-source differences while rejecting a campus's wrong wing.
  const discrepancy = (a, b) => Math.max(...a.flatMap((p, i) => {
    const q = a[(i + 1) % a.length];
    return [edgeDistance(p, b), edgeDistance({x:(p.x+q.x)/2, z:(p.z+q.z)/2}, b)];
  })) * metersPerUnit;
  const errorMeters = Math.max(discrepancy(actual, expected), discrepancy(expected, actual));
  const ratio = area(actual) / area(expected);
  const entrance = support.exteriorEntrance || support.entryAnchor;
  if (errorMeters > 2.5 || ratio < .75 || ratio > 1.33 || !finite(entrance) || edgeDistance(entrance, actual) * metersPerUnit > 3) return null;
  return Object.freeze({sourceId: identity, errorMeters, areaRatio: ratio,
    entranceEvidence: support.exteriorEntrance ? 'published-exterior-door' : 'derived-safe-entry',
    accuracy: content.kind, namedMuseumVerified: false});
}

export function exhibitJournalEventId(contentId, exhibitId) {
  return `event:museum-exhibit:${id(contentId)}:${id(exhibitId)}`;
}
