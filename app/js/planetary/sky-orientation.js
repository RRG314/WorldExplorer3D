import { ctx as appCtx } from '../shared-context.js?v=55';
import { getAstronomicalBody, LANDING_MODE } from '../astronomy/body-catalog.js?v=3';
import { alignStarFieldToBody } from '../sky/starfield-ui.js?v=16';
import { ensurePlanetaryAtmosphere, updatePlanetaryAtmosphere } from './atmosphere-dome.js?v=1';
import { setPlanetaryStarOcclusion, updatePlanetaryStarHorizon } from './star-occlusion.js?v=2';

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;
const OBSERVERS = Object.freeze({
  moon: Object.freeze({
    latitudeDeg: 0.67408,
    longitudeDeg: 23.47297,
    poleRaAtJ2000: 269.9949,
    poleRaPerCentury: 0.0031,
    poleDecAtJ2000: 66.5392,
    poleDecPerCentury: 0.013,
    primeAtJ2000: 38.3213,
    rotationPerDay: 13.17635815,
    starOpacity: 0.94
  }),
  mars: Object.freeze({
    latitudeDeg: 18.65,
    longitudeDeg: 226.2,
    poleRaAtJ2000: 317.68143,
    poleRaPerCentury: -0.1061,
    poleDecAtJ2000: 52.8865,
    poleDecPerCentury: -0.0609,
    primeAtJ2000: 176.63,
    rotationPerDay: 350.89198226,
    starOpacity: 0.92
  })
});

function bodyOrientation(body, date = new Date()) {
  const observer = OBSERVERS[body];
  const days = (date.getTime() - J2000_MS) / DAY_MS;
  if (!observer) {
    const canonical = getAstronomicalBody(body);
    if (!canonical || canonical.exploration.landingMode !== LANDING_MODE.SOLID_SURFACE) return null;
    const address = appCtx.planetarySurfaceAuthority?.snapshot?.()?.active?.bodyId === canonical.id
      ? appCtx.activeSolidWorldSurface?.userData?.worldAddress
      : null;
    const rotationDays = canonical.physical.rotationPeriodS / 86400;
    return {
      body: canonical.id,
      latitudeDeg: Number(address?.latitudeDeg) || 0,
      longitudeDeg: Number(address?.longitudeDegPositiveEast) || 0,
      poleRaDeg: 0,
      poleDecDeg: 90 - canonical.physical.axialTiltRad * 180 / Math.PI,
      primeMeridianDeg: ((days / rotationDays) * 360) % 360,
      starOpacity: canonical.atmosphere.class === 'dense' ? 0.08 : canonical.atmosphere.class === 'thin' ? 0.72 : 0.94,
      computedAtIso: date.toISOString(),
      truthClass: 'gameplay_abstraction'
    };
  }
  const centuries = days / 36525;
  return {
    body,
    latitudeDeg: observer.latitudeDeg,
    longitudeDeg: observer.longitudeDeg,
    poleRaDeg: observer.poleRaAtJ2000 + observer.poleRaPerCentury * centuries,
    poleDecDeg: observer.poleDecAtJ2000 + observer.poleDecPerCentury * centuries,
    primeMeridianDeg: (observer.primeAtJ2000 + observer.rotationPerDay * days) % 360,
    starOpacity: observer.starOpacity,
    computedAtIso: date.toISOString(),
    truthClass: 'modeled_physics'
  };
}

function setPlanetarySky(body, date = new Date(), options = {}) {
  const normalizedBody = String(body || '').toLowerCase();
  const orientation = bodyOrientation(normalizedBody, date);
  if (!appCtx.starField) return null;
  if (orientation) alignStarFieldToBody(orientation);
  else appCtx.starField.userData.observerBody = normalizedBody || 'planetary';
  setPlanetaryStarOcclusion(appCtx.starField, true);
  if (appCtx.renderer) {
    appCtx.starField.userData.earthLocalClippingEnabled ??= appCtx.renderer.localClippingEnabled === true;
    appCtx.renderer.localClippingEnabled = true;
  }
  appCtx.starField.visible = true;
  const requestedOpacity = Number(options.starOpacity);
  const starOpacity = orientation?.starOpacity ?? (Number.isFinite(requestedOpacity) ? requestedOpacity : 0.9);
  appCtx.starField.traverse((child) => {
    if (!child.material || child.userData?.skyHitbox) return;
    const baseOpacity = Number(child.userData?.baseOpacity ?? child.material.opacity ?? 1);
    child.material.transparent = true;
    child.material.opacity = Math.min(baseOpacity, starOpacity);
    child.material.needsUpdate = true;
  });
  appCtx.planetarySkyOrientation = orientation || Object.freeze({
    body: normalizedBody || 'planetary',
    starOpacity,
    computedAtIso: date.toISOString(),
    truthClass: 'gameplay_abstraction'
  });
  const marsAtmosphere = ensurePlanetaryAtmosphere(appCtx.scene, 'mars');
  if (marsAtmosphere) marsAtmosphere.visible = normalizedBody === 'mars';
  updatePlanetarySky();
  return orientation;
}

function clearPlanetarySky() {
  const marsAtmosphere = appCtx.scene?.getObjectByName('Planetary atmosphere: mars');
  if (marsAtmosphere) marsAtmosphere.visible = false;
  setPlanetaryStarOcclusion(appCtx.starField, false);
  if (appCtx.renderer && appCtx.starField?.userData && 'earthLocalClippingEnabled' in appCtx.starField.userData) {
    appCtx.renderer.localClippingEnabled = appCtx.starField.userData.earthLocalClippingEnabled;
    delete appCtx.starField.userData.earthLocalClippingEnabled;
  }
  appCtx.planetarySkyOrientation = null;
  // Planetary modes directly restyle the shared star materials. Invalidate
  // Earth's cached sky signature so the next forced astronomical refresh
  // reapplies visibility and opacity even when the player returns to the same
  // location and time-of-day bucket.
  appCtx.invalidateSkyVisualCache?.();
}

function updatePlanetarySky() {
  const env = appCtx.getEnv?.();
  if (!appCtx.starField || !appCtx.camera) return;
  if (env === appCtx.ENV?.MOON || env === appCtx.ENV?.MARS || env === appCtx.ENV?.PLANETARY) {
    appCtx.starField.position.copy(appCtx.camera.position);
    updatePlanetaryStarHorizon(appCtx.starField, appCtx.camera.position.y);
  }
  const marsAtmosphere = appCtx.scene?.getObjectByName('Planetary atmosphere: mars');
  updatePlanetaryAtmosphere(marsAtmosphere, appCtx.camera, appCtx.sun?.position);
}

Object.assign(appCtx, { bodyOrientation, clearPlanetarySky, setPlanetarySky, updatePlanetarySky });

export { bodyOrientation, clearPlanetarySky, setPlanetarySky, updatePlanetarySky };
