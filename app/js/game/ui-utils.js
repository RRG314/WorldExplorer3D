export function formatPrice(value) {
  return '$' + Math.round(value).toLocaleString();
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

export function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E');
}

export function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function sanitizeHttpUrl(raw) {
  if (!raw) return '';
  try {
    const baseHref = globalThis.location && globalThis.location.href ? globalThis.location.href : 'https://example.com/';
    const parsed = new URL(String(raw), baseHref);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    return '';
  } catch {
    return '';
  }
}
