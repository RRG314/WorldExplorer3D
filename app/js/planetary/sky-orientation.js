import { ctx as appCtx } from '../shared-context.js?v=55';
import { alignStarFieldToBody } from '../sky/starfield-ui.js?v=2';

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
    starOpacity: 0.92
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
    starOpacity: 0.28
  })
});

function bodyOrientation(body, date = new Date()) {
  const observer = OBSERVERS[body];
  if (!observer) return null;
  const days = (date.getTime() - J2000_MS) / DAY_MS;
  const centuries = days / 36525;
  return {
    body,
    latitudeDeg: observer.latitudeDeg,
    longitudeDeg: observer.longitudeDeg,
    poleRaDeg: observer.poleRaAtJ2000 + observer.poleRaPerCentury * centuries,
    poleDecDeg: observer.poleDecAtJ2000 + observer.poleDecPerCentury * centuries,
    primeMeridianDeg: (observer.primeAtJ2000 + observer.rotationPerDay * days) % 360,
    starOpacity: observer.starOpacity,
    computedAtIso: date.toISOString()
  };
}

function setPlanetarySky(body, date = new Date()) {
  const orientation = bodyOrientation(String(body || '').toLowerCase(), date);
  if (!orientation || !appCtx.starField) return null;
  alignStarFieldToBody(orientation);
  appCtx.starField.visible = true;
  appCtx.starField.children.forEach((child) => {
    if (!child.material || child.userData?.skyHitbox) return;
    const baseOpacity = Number(child.userData?.baseOpacity ?? child.material.opacity ?? 1);
    child.material.transparent = true;
    child.material.opacity = Math.min(baseOpacity, orientation.starOpacity);
  });
  appCtx.planetarySkyOrientation = orientation;
  updatePlanetarySky();
  return orientation;
}

function updatePlanetarySky() {
  const env = appCtx.getEnv?.();
  if (!appCtx.starField || !appCtx.camera) return;
  if (env === appCtx.ENV?.MOON || env === appCtx.ENV?.MARS) {
    appCtx.starField.position.copy(appCtx.camera.position);
  }
}

Object.assign(appCtx, { bodyOrientation, setPlanetarySky, updatePlanetarySky });

export { bodyOrientation, setPlanetarySky, updatePlanetarySky };
