export function updateOceanHud(appCtx, oceanMode, nowSeconds = 0) {
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
  const indOff = document.getElementById('indOff');
  const boostFill = document.getElementById('boostFill');
  const offRoadWarn = document.getElementById('offRoadWarn');
  const sub = oceanMode.submarine;

  const speedKnots = Math.abs(sub.speed) * 1.94;
  const depth = Math.max(0, Math.round(-sub.position.y));
  const batteryPct = Math.round(76 + Math.sin(nowSeconds * 0.09) * 7);

  if (speedUnitLabel) speedUnitLabel.textContent = 'KTS';
  if (limitLabel) limitLabel.textContent = 'DEPTH';
  if (speedEl) {
    speedEl.textContent = String(Math.round(speedKnots));
    speedEl.classList.remove('fast');
  }
  if (limitEl) limitEl.textContent = `${depth}m`;
  if (streetEl) streetEl.textContent = 'Ocean Mode';
  if (locationLineEl) {
    locationLineEl.style.display = '';
    locationLineEl.textContent = `${oceanMode.launchSite.name}, ${oceanMode.launchSite.region}`;
  }

  const lat = oceanMode.launchSite.lat - sub.position.z / appCtx.SCALE;
  const lonDenom = appCtx.SCALE * Math.cos(oceanMode.launchSite.lat * Math.PI / 180);
  const lon = oceanMode.launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)} | DEPTH ${depth}m`;
  const osmUrl = `https://www.openstreetmap.org/edit?editor=id#map=19/${lat.toFixed(7)}/${lon.toFixed(7)}`;
  document.querySelectorAll('[data-osm-location-link]').forEach((link) => {
    link.href = osmUrl;
    link.hidden = false;
    link.setAttribute('aria-disabled', 'false');
  });

  if (boostFill) {
    boostFill.style.width = `${batteryPct}%`;
    boostFill.classList.add('active');
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
    indDrift.textContent = 'SUB';
    indDrift.classList.add('on');
  }
  if (indOff) {
    indOff.textContent = 'SONAR';
    indOff.classList.remove('warn');
    indOff.classList.toggle('on', speedKnots > 11);
  }
  if (offRoadWarn) offRoadWarn.classList.remove('active');

}
