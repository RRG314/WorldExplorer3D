// Entry eligibility is separate from rendered depth: neither a label nor a
// procedural seabed proves that a selected coordinate is navigable water.
export function oceanEntryDecision(site, evidence = site?.surfaceEvidence) {
  const valid = Number.isFinite(site?.lat) && Number.isFinite(site?.lon)
    && Math.abs(site.lat) <= 90 && Math.abs(site.lon) <= 180;
  const deny = (reason) => ({ allowed: false, reason });
  if (!valid) return deny('Choose valid ocean coordinates first.');
  if (evidence?.kind === 'land') return deny('This point is on land or too shallow. Choose a point farther offshore.');
  if (evidence?.kind === 'cryosphere') return deny('Under-ice exploration is not available at this location.');
  // A reverse-geocoder names a nearby feature; it does not locate the coastline.
  if (evidence?.verified !== true || evidence?.source !== 'gebco-elevation-sample'
    || !Number.isFinite(evidence.elevationMeters)) {
    return deny('Water depth could not be checked. Try again or choose another offshore point.');
  }
  if (evidence.elevationMeters > -5) return deny('This point is too shallow for the submarine. Choose a point farther offshore.');
  return { allowed: true, reason: '', entry: Object.freeze({
    lat: site.lat, lon: site.lon, source: evidence.source, kind: 'modeled-ocean',
    elevationMeters: evidence.elevationMeters
  }) };
}

export function hasOceanEntry(site, entry) {
  if (!Number.isFinite(site?.lat) || !Number.isFinite(site?.lon)
    || Math.abs(site.lat) > 90 || Math.abs(site.lon) > 180
    || entry?.lat !== site.lat || entry?.lon !== site.lon) return false;
  if (entry.source === 'mapped-boat-water' && entry.kind === 'mapped-water-area') return true;
  return entry.source === 'gebco-elevation-sample' && entry.kind === 'modeled-ocean'
    && Number.isFinite(entry.elevationMeters) && entry.elevationMeters <= -5;
}
