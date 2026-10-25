import {isEarthWorldUsable} from './world-readiness.js';

// Read-only policy for a future trusted Portal catalog. An assessment is evidence
// supplied by that catalog, never a claim accepted from a widget, URL or player.
// This module cannot qualify a place by itself, move an actor or award a visit.
export const PORTAL_QUALIFICATION_VERSION = 1;
export const PORTAL_QUALITY_CHECKS = Object.freeze([
  'geographicIdentity', 'visualExperience', 'safeArrival', 'playableContent', 'devicePerformance'
]);
const profiles = Object.freeze({
  city: Object.freeze(['terrain', 'transport', 'buildings', 'places']),
  nature: Object.freeze(['terrain', 'landuse', 'places']),
  coast: Object.freeze(['terrain', 'hydrology', 'landuse', 'places'])
});
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value);
const buildIdentity = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[a-z0-9.+_:-]+$/i.test(value);
const timestamp = value => Number.isSafeInteger(value) && value > 0;
const point = value => Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90 &&
  Number.isFinite(value?.lon) && Math.abs(value.lon) <= 180;
const bounds = value => value && [value.south, value.north, value.west, value.east].every(Number.isFinite) &&
  value.south < value.north && value.south >= -90 && value.north <= 90 &&
  Math.abs(value.west) <= 180 && Math.abs(value.east) <= 180 && value.west !== value.east &&
  !(value.west === 180 && value.east === -180);
function contains(area, location) {
  if (!bounds(area) || !point(location) || location.lat < area.south || location.lat > area.north) return false;
  // West > east is a small region crossing the antimeridian, not an empty box.
  const longitude = location.lon === 180 ? -180 : location.lon;
  return area.west <= area.east
    ? (longitude >= area.west && longitude <= area.east) || (longitude === -180 && area.east === 180)
    : longitude >= area.west || longitude <= area.east;
}
const ids = value => Array.isArray(value) && value.length > 0 && value.length <= 32 &&
  value.every(identifier) && new Set(value).size === value.length;
const sameFields = (left, right, fields) => !!left && !!right && fields.every(key => left[key] === right[key]);

export function portalDestinationRequirements(destination) {
  const base = Object.hasOwn(profiles, destination?.kind) ? profiles[destination.kind] : null;
  if (!base) return null;
  return Object.freeze([...new Set([...base, ...(destination.arrival?.mode === 'drive' ? ['transport'] : [])])]);
}

function destinationValid(destination) {
  return destination?.type === 'PortalDestination' && destination.schemaVersion === 1 &&
    identifier(destination.id) && identifier(destination.revision) && identifier(destination.contentVersion) &&
    destination.environment === 'EARTH' && portalDestinationRequirements(destination) !== null &&
    point(destination.origin) && point(destination.arrival) && bounds(destination.bounds) &&
    contains(destination.bounds, destination.origin) && contains(destination.bounds, destination.arrival) &&
    ['walk', 'drive'].includes(destination.arrival.mode) && ids(destination.experienceIds);
}

function decision(destination, requiredLayers, reasons) {
  return Object.freeze({
    destinationId: identifier(destination?.id) ? destination.id : null,
    eligible: reasons.length === 0,
    requiredLayers: requiredLayers || Object.freeze([]),
    reasons: Object.freeze([...new Set(reasons)])
  });
}

/** Reject unqualified suggestions. Compatibility versions cover affected code,
 * assets and source packages, so unrelated documentation changes need no retest.
 * `now` is supplied by the caller; there is no timer, cache or refresh owner here.
 */
export function evaluatePortalOffer(destination, assessment, context = {}) {
  context ??= {};
  const required = portalDestinationRequirements(destination);
  const reasons = [];
  if (!destinationValid(destination)) return decision(destination, required, ['invalid-destination']);
  if (!timestamp(context.now) || !identifier(context.deviceProfile) ||
      !identifier(context.renderContractVersion) || !identifier(context.contentVersion)) {
    reasons.push('missing-qualification-context');
  }
  if (assessment?.type !== 'PortalQualification' || assessment.schemaVersion !== PORTAL_QUALIFICATION_VERSION ||
      assessment.status !== 'approved' || !identifier(assessment.evidenceId) || !buildIdentity(assessment.testedBuildId)) {
    return decision(destination, required, [...reasons, 'missing-approved-qualification']);
  }
  if (assessment.destinationId !== destination.id || assessment.destinationRevision !== destination.revision ||
      assessment.kind !== destination.kind || !sameFields(assessment.origin, destination.origin, ['lat', 'lon']) ||
      !sameFields(assessment.bounds, destination.bounds, ['south', 'north', 'west', 'east']) ||
      !sameFields(assessment.arrival, destination.arrival, ['lat', 'lon', 'mode'])) reasons.push('qualification-scope-mismatch');
  if (assessment.contentVersion !== destination.contentVersion || assessment.contentVersion !== context.contentVersion ||
      assessment.renderContractVersion !== context.renderContractVersion) reasons.push('qualification-version-mismatch');
  if (assessment.deviceProfile !== context.deviceProfile) reasons.push('device-not-qualified');
  if (!timestamp(assessment.checkedAt) || !timestamp(assessment.validUntil) ||
      assessment.checkedAt > context.now || assessment.validUntil <= context.now ||
      assessment.checkedAt >= assessment.validUntil) reasons.push('qualification-not-current');
  for (const check of PORTAL_QUALITY_CHECKS) {
    if (assessment.checks?.[check] !== 'passed') reasons.push(`unverified-${check}`);
  }
  for (const layer of required) {
    if (assessment.layers?.[layer] !== 'verified') reasons.push(`unverified-layer:${layer}`);
  }
  if (!ids(assessment.experienceIds) || destination.experienceIds.some(id => !assessment.experienceIds.includes(id))) {
    reasons.push('unverified-experience');
  }
  return decision(destination, required, reasons);
}

/** Second boundary after the existing session/load owner publishes Earth.
 * This establishes publication readiness only. Travel admission, actual actor
 * placement, renderer presentation and visit/expedition receipts remain owned
 * by their existing systems. No coordinates from this function are commands.
 */
export function evaluatePortalWorldReadiness(appCtx, loadResult, destination, assessment, context = {}) {
  const offer = evaluatePortalOffer(destination, assessment, context);
  if (!offer.eligible) return offer;
  const reasons = [];
  if (!loadResult || appCtx?.getEnv?.() !== 'EARTH' || !isEarthWorldUsable(appCtx, loadResult)) {
    return decision(destination, offer.requiredLayers, ['world-not-current-and-playable']);
  }
  const publication = appCtx.worldPublication;
  if (publication?.type !== 'WorldSnapshot' || !Object.isFrozen(publication) ||
      !sameFields(publication.location, destination.origin, ['lat', 'lon'])) reasons.push('published-location-mismatch');
  for (const layer of offer.requiredLayers) {
    const product = publication.layers?.[layer];
    // Compiler products deliberately say partial when they have records. That
    // means data exists, not worldwide completeness. Quality comes from the
    // scoped assessment above, never by relabelling partial as complete.
    if (!['partial', 'complete'].includes(product?.completeness) || !product.authority || !product.records?.length) {
      reasons.push(`published-layer-missing:${layer}`);
    }
  }
  return decision(destination, offer.requiredLayers, reasons);
}
