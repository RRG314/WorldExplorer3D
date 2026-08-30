const ANALYTICS_CONSENT_KEY = 'worldExplorer3D.analyticsConsent.v1';
const CONSENT_GRANTED = 'granted';
const CONSENT_DENIED = 'denied';

function readAnalyticsConsent() {
  try {
    const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : 'unset';
  } catch (_) {
    return 'unset';
  }
}

function writeAnalyticsConsent(value) {
  const normalized = value === CONSENT_GRANTED ? CONSENT_GRANTED : CONSENT_DENIED;
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, normalized);
  } catch (_) {
    // The runtime still applies the in-memory consent signal when storage is blocked.
  }
  globalThis.__WE3D_ANALYTICS_CONSENT__ = normalized;
  globalThis.dispatchEvent?.(new CustomEvent('we3d:analytics-consent', { detail: { value: normalized } }));
  return normalized;
}

function setupAnalyticsConsentUi() {
  const banner = document.getElementById('analyticsConsentBanner');
  const allowButton = document.getElementById('analyticsConsentAllowBtn');
  const denyButton = document.getElementById('analyticsConsentDenyBtn');
  const manageButton = document.getElementById('analyticsConsentManageBtn');
  const titleScreen = document.getElementById('titleScreen');
  if (!banner || !allowButton || !denyButton) return false;

  const show = () => {
    banner.hidden = false;
    banner.setAttribute('aria-hidden', 'false');
  };
  const hide = () => {
    banner.hidden = true;
    banner.setAttribute('aria-hidden', 'true');
  };
  const choose = (value) => {
    writeAnalyticsConsent(value);
    hide();
  };
  allowButton.addEventListener('click', () => choose(CONSENT_GRANTED));
  denyButton.addEventListener('click', () => choose(CONSENT_DENIED));
  manageButton?.addEventListener('click', show);
  const syncTitleVisibility = () => {
    const titleVisible = !titleScreen?.classList.contains('hidden');
    if (!titleVisible) hide();
    else if (readAnalyticsConsent() === 'unset') show();
  };
  if (titleScreen) {
    new MutationObserver(syncTitleVisibility).observe(titleScreen, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  syncTitleVisibility();
  return true;
}

export {
  ANALYTICS_CONSENT_KEY,
  CONSENT_DENIED,
  CONSENT_GRANTED,
  readAnalyticsConsent,
  setupAnalyticsConsentUi,
  writeAnalyticsConsent
};
