import { getUniverseDestinations, resolveUniverseAddress, distanceLightYears } from '../universe/catalog.js?v=11';

export function starTravelDestination(star) {
  if (!star) return null;
  const names = new Set([star.name, star.proper].filter(Boolean).map((name) => name.toLowerCase()));
  return getUniverseDestinations().find((entry) => entry.objectClass === 'planetary_system' && (
    [entry.name, ...(entry.aliases || [])].some((name) => names.has(name.toLowerCase())) ||
    (entry.canonicalPosition?.frame === 'ICRS' && star.dist > 0 &&
      Math.abs(distanceLightYears(entry) - star.dist) / star.dist < 0.05 &&
      Math.abs(entry.canonicalPosition.decDeg - star.dec) < 0.1 &&
      Math.abs(((entry.canonicalPosition.raDeg - star.ra * 15 + 540) % 360) - 180) < 0.1)
  )) || null;
}

export function showCelestialSelection(ctx, { entityId, star, projected } = {}) {
  const entity = entityId ? resolveUniverseAddress(entityId) : starTravelDestination(star);
  if (!entity && !star) return false;
  const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
  set('ssInfoTitle', star?.name || entity.name);
  set('ssInfoType', star ? `Star · ${star.constellation}` : entity.objectClass.replaceAll('_', ' '));
  set('ssInfoDesc', star ? `${star.source || 'HYG v4.0 (J2000)'} catalog position. Distance and brightness below are calculated from your current viewpoint; stellar proper motion is not simulated.` : `${entity.description || entity.name}. ${entity.accuracy || 'Catalog data'}. Surface appearance and display scale are modeled where observations are unavailable.`);
  set('ssInfoMetaLabel', star ? 'OBSERVER-RELATIVE STAR DATA' : 'CATALOG DATA');
  set('ssInfoMetric1Label', star ? 'Distance from you' : 'Distance from Sol');
  const distance = star ? projected?.distanceLy : distanceLightYears(entity);
  set('ssInfoDistAU', Number.isFinite(distance) ? `${distance.toFixed(2)} ly` : 'Unknown');
  set('ssInfoMetric2Label', star ? 'Apparent magnitude here' : 'Data source');
  set('ssInfoDistKM', star ? Number(projected?.magnitude ?? star.mag).toFixed(2) : entity.provenance?.[0]?.label || 'Modeled');
  set('ssInfoMetric3Label', star ? 'Reference coordinates' : 'Host system');
  set('ssInfoDistEarth', star ? `${star.ra.toFixed(3)}h / ${star.dec.toFixed(3)}°` : entity.hostName || entity.name);
  ctx.solarSystem.selectedBodyId = null;
  ctx.solarSystem.selectedUniverseId = entity?.id || null;
  const button = document.getElementById('ssInfoSetCourse');
  if (button) {
    button.style.display = entity ? 'block' : 'none';
    button.disabled = false;
    button.style.opacity = '1';
    button.textContent = entity ? `TRAVEL TO ${entity.name.toUpperCase()}` : '';
  }
  ctx.solarSystem.infoPanel.style.display = 'block';
  document.body.classList.add('space-destination-details-open');
  return true;
}
