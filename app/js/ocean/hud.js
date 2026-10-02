import { worldUnitsPerSecondToKnots } from '../physics/vehicle-speed-units.js?v=2';

import { drawOceanNavigationMap } from './navigation-map.js?v=1';

export function updateOceanHud(appCtx, oceanMode, nowSeconds = 0, sampleSeabedEvidence = null) {
  const speedEl = document.getElementById('speed');
  const limitEl = document.getElementById('limit');
  const streetEl = document.getElementById('street');
  const locationLineEl = document.getElementById('locationLine');
  const speedUnitLabel = document.getElementById('speedUnitLabel');
  const limitLabel = document.getElementById('limitLabel');
  const coordsEl = document.getElementById('coordsText') || document.getElementById('coords');
  const indBrake = document.getElementById('indBrake');
  const indBoost = document.getElementById('indBoost');
  const indDrift = document.getElementById('indDrift');
  const conditionBar = document.getElementById('conditionBar');
  const conditionFill = document.getElementById('conditionFill');
  const diving=!!oceanMode.diver?.active;
  const sub = diving?oceanMode.diver.navigationActor():oceanMode.submarine;

  const speedKnots = Math.abs(worldUnitsPerSecondToKnots(sub.speed, appCtx.METERS_PER_WORLD_UNIT));
  const metersPerUnit = Number(appCtx.METERS_PER_WORLD_UNIT) > 0 ? appCtx.METERS_PER_WORLD_UNIT : 1.11;
  const depth = Math.max(0, Math.round(((oceanMode.waterSample?.surfaceY ?? .08)-sub.position.y) * metersPerUnit));
  const air=diving?oceanMode.diver.snapshot().swimming?.airSeconds:null;
  const condition = diving?Math.max(0,Math.min(1,(air??180)/180)):Math.max(0, Math.min(1, Number(oceanMode.condition ?? sub.condition ?? 1)));
  const conditionPct = Math.round(condition * 100);

  if (speedUnitLabel) speedUnitLabel.textContent = 'KTS';
  if (limitLabel) limitLabel.textContent = 'SIM DEPTH';
  if (speedEl) {
    speedEl.textContent = String(Math.round(speedKnots));
    speedEl.classList.remove('fast');
  }
  if (limitEl) limitEl.textContent = `${depth}m`;
  if (streetEl) streetEl.textContent = diving?'Ocean · Scuba explorer':'Ocean Mode';
  if (locationLineEl) {
    locationLineEl.style.display = '';
    locationLineEl.textContent = `${oceanMode.launchSite.name}, ${oceanMode.launchSite.region}`;
  }

  const lat = oceanMode.launchSite.lat - sub.position.z / appCtx.SCALE;
  const lonDenom = appCtx.SCALE * Math.cos(oceanMode.launchSite.lat * Math.PI / 180);
  const lon = oceanMode.launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)} | SIM DEPTH ${depth}m`;
  const osmUrl = `https://www.openstreetmap.org/edit?editor=id#map=19/${lat.toFixed(7)}/${lon.toFixed(7)}`;
  document.querySelectorAll('[data-osm-location-link]').forEach((link) => {
    link.href = osmUrl;
    link.hidden = false;
    link.setAttribute('aria-disabled', 'false');
  });
  drawOceanNavigationMap(appCtx, oceanMode, sampleSeabedEvidence);
  if (limitEl) limitEl.title = 'Simulated depth below the game sea surface; terrain depth is compressed for gameplay.';

  if (conditionFill) {
    conditionFill.style.width = `${conditionPct}%`;
    conditionFill.dataset.state = condition <= .25 ? 'critical' : condition <= .6 ? 'injured' : 'healthy';
  }
  if (conditionBar) {
    conditionBar.setAttribute('aria-label', diving?'Dive air':'Submarine health');
    conditionBar.setAttribute('aria-valuenow', String(conditionPct));
    conditionBar.title = `${diving?'Dive air':'Submarine health'} · ${conditionPct}%`;
  }
  if (indBrake) {
    indBrake.textContent = 'ASC';
    indBrake.classList.toggle('on', !!(appCtx.keys.Space || appCtx.keys.KeyR));
  }
  if (indBoost) {
    indBoost.textContent = 'DSC';
    indBoost.classList.toggle('on', !!(appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight || appCtx.keys.ControlLeft || appCtx.keys.ControlRight));
  }
  if (indDrift) {
    indDrift.textContent = diving?'SWIM':'SUB';
    indDrift.classList.add('on');
  }
}
