const ANALYTICS_CONSENT_KEY = 'worldExplorer3D.analyticsConsent.v1';
const CONSENT_GRANTED = 'granted';
const CONSENT_DENIED = 'denied';

function readAnalyticsConsent() {
  const memoryValue = globalThis.__WE3D_ANALYTICS_CONSENT__;
  try {
    const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (value === CONSENT_GRANTED || value === CONSENT_DENIED) return value;
  } catch (_) {}
  return memoryValue === CONSENT_GRANTED || memoryValue === CONSENT_DENIED ? memoryValue : 'unset';
}

function analyticsStorageAllowed(value = readAnalyticsConsent()) {
  return value !== CONSENT_DENIED;
}

function clearAnalyticsCookies() {
  if (typeof document === 'undefined') return;
  const names = document.cookie.split(';')
    .map((entry) => entry.split('=')[0]?.trim())
    .filter((name) => /^_ga(?:_|$)/.test(name || ''));
  const hostname = String(globalThis.location?.hostname || '').trim();
  const domains = new Set(['', hostname, hostname ? `.${hostname}` : '']);
  if (hostname.split('.').length > 2) {
    const registrable = hostname.split('.').slice(-2).join('.');
    domains.add(registrable);
    domains.add(`.${registrable}`);
  }
  names.forEach((name) => {
    domains.forEach((domain) => {
      const domainPart = domain ? `; Domain=${domain}` : '';
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domainPart}`;
    });
  });
}

function writeAnalyticsConsent(value) {
  const normalized = value === CONSENT_GRANTED ? CONSENT_GRANTED : CONSENT_DENIED;
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, normalized);
  } catch (_) {
    // The runtime still applies the in-memory consent signal when storage is blocked.
  }
  globalThis.__WE3D_ANALYTICS_CONSENT__ = normalized;
  if (normalized === CONSENT_DENIED) clearAnalyticsCookies();
  globalThis.dispatchEvent?.(new CustomEvent('we3d:analytics-consent', { detail: { value: normalized } }));
  return normalized;
}

function setupAnalyticsConsentUi() {
  const banner = document.getElementById('analyticsConsentBanner');
  const allowButton = document.getElementById('analyticsConsentAllowBtn');
  const denyButton = document.getElementById('analyticsConsentDenyBtn');
  const manageButton = document.getElementById('analyticsConsentManageBtn');
  const licensesDialog = document.getElementById('dataLicensesDialog');
  const titleScreen = document.getElementById('titleScreen');
  if (!banner || !allowButton || !denyButton) return false;

  const show = () => {
    const current = readAnalyticsConsent();
    allowButton.textContent = current === CONSENT_DENIED ? 'Use standard analytics' : 'Keep standard analytics';
    denyButton.textContent = 'Use limited analytics';
    banner.hidden = false;
    banner.setAttribute('aria-hidden', 'false');
  };
  const hide = () => {
    banner.hidden = true;
    banner.setAttribute('aria-hidden', 'true');
  };
  const choose = (value) => {
    writeAnalyticsConsent(value);
    banner.classList.remove('attention');
    hide();
  };
  allowButton.addEventListener('click', () => choose(CONSENT_GRANTED));
  denyButton.addEventListener('click', () => choose(CONSENT_DENIED));
  manageButton?.addEventListener('click', () => {
    if (licensesDialog instanceof HTMLDialogElement && licensesDialog.open) licensesDialog.close();
    show();
  });
  const syncTitleVisibility = () => {
    const titleVisible = !titleScreen?.classList.contains('hidden');
    if (!titleVisible) hide();
  };
  if (titleScreen) {
    new MutationObserver(syncTitleVisibility).observe(titleScreen, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  globalThis.addEventListener?.('we3d:analytics-consent-request', () => {
    show();
    banner.classList.remove('attention');
    void banner.offsetWidth;
    banner.classList.add('attention');
    allowButton.focus({ preventScroll: true });
  });
  syncTitleVisibility();
  return true;
}

export {
  ANALYTICS_CONSENT_KEY,
  CONSENT_DENIED,
  CONSENT_GRANTED,
  analyticsStorageAllowed,
  clearAnalyticsCookies,
  readAnalyticsConsent,
  setupAnalyticsConsentUi,
  writeAnalyticsConsent
};
