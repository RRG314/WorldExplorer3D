function drawOceanNavigationMap(oceanMode, depth) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas?.getContext?.('2d');
  if (!canvas || !ctx) return;

  const width = canvas.width || 150;
  const height = canvas.height || 150;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const sub = oceanMode.submarine;
  const positionX = Number(sub?.position?.x) || 0;
  const positionZ = Number(sub?.position?.z) || 0;

  const water = ctx.createRadialGradient(centerX, centerY, 8, centerX, centerY, width * 0.7);
  water.addColorStop(0, '#123b53');
  water.addColorStop(0.58, '#082b3e');
  water.addColorStop(1, '#031924');
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = 'rgba(104, 210, 227, 0.18)';
  ctx.lineWidth = 1;
  for (let step = 25; step < width; step += 25) {
    ctx.beginPath();
    ctx.moveTo(step, 0);
    ctx.lineTo(step, height);
    ctx.stroke();
  }
  for (let step = 25; step < height; step += 25) {
    ctx.beginPath();
    ctx.moveTo(0, step);
    ctx.lineTo(width, step);
    ctx.stroke();
  }

  const contourOffsetX = (positionX * 0.06) % 18;
  const contourOffsetY = (positionZ * 0.04) % 16;
  ctx.strokeStyle = 'rgba(83, 183, 202, 0.34)';
  for (let band = -1; band < 7; band += 1) {
    ctx.beginPath();
    for (let x = -8; x <= width + 8; x += 4) {
      const y = 18 + band * 23 + Math.sin((x + band * 11 + contourOffsetX) * 0.055) * 8 + contourOffsetY;
      if (x === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const markerX = Math.max(12, Math.min(width - 12, centerX + positionX * 0.2));
  const markerY = Math.max(18, Math.min(height - 12, centerY + positionZ * 0.2));
  ctx.translate(markerX, markerY);
  ctx.rotate(-(Number(sub?.yaw) || 0));
  ctx.fillStyle = '#e9fbff';
  ctx.strokeStyle = '#42d4e8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#d8f8ff';
  ctx.font = '700 9px monospace';
  ctx.fillText(oceanMode.bathymetryReady ? 'BATHYMETRY' : 'LOCAL SONAR', 8, 13);
  ctx.fillStyle = '#8ed9e6';
  ctx.font = '8px monospace';
  ctx.fillText(`${depth}m`, 8, height - 8);
  ctx.fillText('N', width - 14, 13);
}

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
  drawOceanNavigationMap(oceanMode, depth);

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
