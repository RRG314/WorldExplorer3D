// Verifier classification only. Keep source and CORS request target separate:
// Chrome attributes a blocked external fetch's console message to the local page.
const optionalHosts = new Set(['overpass-api.de', 'overpass.private.coffee', 'google-analytics.com']);
export function isOptionalExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && [...optionalHosts].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
export function isOptionalProviderConsole({text, sourceUrl, pageOrigin}) {
  if (isOptionalExternalUrl(sourceUrl)) return true;
  const match = /^Access to (?:fetch|XMLHttpRequest) at '([^']+)' from origin '([^']+)' has been blocked by CORS policy:/.exec(text);
  if (!match || !isOptionalExternalUrl(match[1])) return false;
  try { return new URL(match[2]).origin === new URL(pageOrigin).origin; }
  catch { return false; }
}
