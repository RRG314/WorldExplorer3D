function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeLongText(value, max = 360) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDateTime(value) {
  const ms = finiteNumber(value, 0);
  if (!ms) return 'Unknown';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  } catch (_) {
    return new Date(ms).toISOString();
  }
}

function formatRelative(value) {
  const ms = finiteNumber(value, 0);
  if (!ms) return 'Unknown';
  const delta = Date.now() - ms;
  const minutes = Math.round(Math.abs(delta) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ${delta >= 0 ? 'ago' : 'from now'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${delta >= 0 ? 'ago' : 'from now'}`;
  const days = Math.round(hours / 24);
  return `${days}d ${delta >= 0 ? 'ago' : 'from now'}`;
}

function formatPercentLike(value) {
  const n = finiteNumber(value, NaN);
  return Number.isFinite(n) ? `${n}` : '-';
}

function optionMarkup(options = [], selectedValue = '') {
  return options.map(([value, label]) => `
    <option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(label)}</option>
  `).join('');
}

function buildWorldUrl(lat, lon, label = 'Admin Preview') {
  const target = new URL('../app/', window.location.href);
  target.searchParams.set('loc', 'custom');
  target.searchParams.set('lat', finiteNumber(lat, 0).toFixed(6));
  target.searchParams.set('lon', finiteNumber(lon, 0).toFixed(6));
  target.searchParams.set('lname', sanitizeText(label || 'Admin Preview', 80));
  target.searchParams.set('mode', 'walking');
  return target.toString();
}

function buildOsmUrl(lat, lon) {
  const safeLat = finiteNumber(lat, 0).toFixed(6);
  const safeLon = finiteNumber(lon, 0).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${safeLat}&mlon=${safeLon}#map=19/${safeLat}/${safeLon}`;
}

export {
  buildOsmUrl,
  buildWorldUrl,
  escapeHtml,
  finiteNumber,
  formatDateTime,
  formatPercentLike,
  formatRelative,
  optionMarkup,
  pluralize,
  sanitizeLongText,
  sanitizeText
};
