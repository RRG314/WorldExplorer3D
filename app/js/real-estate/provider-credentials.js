const legacyKeys = Object.freeze({estated:'estatedApiKey', attom:'attomApiKey', rentcast:'rentcastApiKey'});

// The existing property-provider configuration owns these credentials. Never
// write them to browser storage, saves, diagnostics or a second state store.
export function prepareProviderCredentials(apiConfig, {
  readLegacy = key => globalThis.localStorage.getItem(key),
  removeLegacy = key => globalThis.localStorage.removeItem(key)
} = {}) {
  for (const [provider, key] of Object.entries(legacyKeys)) {
    try {
      const value = readLegacy(key);
      if (!apiConfig[provider] && value) apiConfig[provider] = String(value).trim() || null;
    } catch { /* Storage is optional; in-memory configuration still works. */ }
    try { removeLegacy(key); } catch { /* A denied store must not stop gameplay. */ }
  }
  return apiConfig;
}

export function setProviderCredential(apiConfig, provider, value) {
  if (!Object.hasOwn(legacyKeys, provider)) throw new TypeError('Unknown property provider');
  apiConfig[provider] = String(value || '').trim() || null;
  return !!apiConfig[provider];
}
