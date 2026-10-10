import { analyticsStorageAllowed } from './analytics-consent.js?v=3';
import { assertFirebaseEnvironment } from './firebase-environment-policy.js';

let tools;
let pending;
let retryAfter = 0;
export function analyticsCampaignContext(location = globalThis.location) {
  let query;
  try { query = new URL(location.href).searchParams; } catch { return {}; }
  const source = query.get('utm_source') || '';
  const medium = query.get('utm_medium') || '';
  const name = query.get('utm_campaign') || '';
  // No search terms, arbitrary query fields, links, account IDs or free text.
  if (![source, medium, name].every(value => /^[a-z][a-z0-9_-]{0,47}$/.test(value))) return {};
  return { campaign_source: source, campaign_medium: medium, campaign_name: name };
}

// Preserve a bounded campaign through a quick same-tab Play click, before the
// asynchronous SDK has initialized. Never store the incoming URL or an identity.
export function resolveAnalyticsCampaignContext(scope = globalThis, now = Date.now(), storageAllowed = analyticsStorageAllowed()) {
  const incoming = analyticsCampaignContext(scope.location);
  const key = 'we3d.analyticsCampaign';
  if (!storageAllowed) {
    try { scope.sessionStorage.removeItem(key); } catch {}
    return incoming;
  }
  try {
    if (incoming.campaign_source) {
      scope.sessionStorage.setItem(key, JSON.stringify({ ...incoming, capturedAt: now }));
      return incoming;
    }
    const raw = scope.sessionStorage.getItem(key) || 'null';
    if (raw.length > 512) return {};
    const saved = JSON.parse(raw);
    if (!saved || !Number.isFinite(saved.capturedAt) || now < saved.capturedAt || now - saved.capturedAt > 1800000) {
      scope.sessionStorage.removeItem(key);
      return {};
    }
    const values = [saved.campaign_source, saved.campaign_medium, saved.campaign_name];
    if (!values.every(value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,47}$/.test(value))) return {};
    return { campaign_source: values[0], campaign_medium: values[1], campaign_name: values[2] };
  } catch { return incoming; }
}

const entryCampaign = resolveAnalyticsCampaignContext();
analyticsEventContext(); // Capture an explicit same-tab test flag before SDK loading.

export function analyticsEventContext(scope = globalThis) {
  const build = String(scope.__WORLD_EXPLORER_BUILD__?.buildId || '');
  const release = /^(\d+\.\d+\.\d+)\+[a-f0-9]{7,40}\.[a-f0-9]{16,64}\.(staging|production)$/.exec(build);
  let testing = false;
  try {
    const flag = new URL(scope.location.href).searchParams.get('analytics_test');
    if (flag === '1' || flag === '0') scope.sessionStorage.setItem('we3d.analyticsTest', flag);
    testing = scope.sessionStorage.getItem('we3d.analyticsTest') === '1';
  } catch { /* Storage is optional; no persistent identifier is required. */ }
  return { telemetry_version: 2, app_version: release?.[1] || 'source-preview',
    release_build: release ? build : 'source-preview',
    ...(testing ? { debug_mode: true, traffic_type: 'internal' } : {}) };
}

export function analyticsPageContext(location = globalThis.location, referrer = globalThis.document?.referrer || '') {
  const url = new URL(location.href);
  // Never send capture tokens, coordinates, room codes, searches, or arbitrary titles.
  const path = url.pathname;
  const section = path.startsWith('/app/capture') ? 'capture' : path.startsWith('/app') ? 'game'
    : path.startsWith('/account/admin') || path.startsWith('/account/moderation') ? 'admin'
    : path.startsWith('/account') ? 'account' : path.startsWith('/about') ? 'about'
    : path.startsWith('/legal/privacy') ? 'privacy' : path.startsWith('/legal/terms') ? 'terms' : 'home';
  const paths = { home: '/', game: '/app/', capture: '/app/capture.html', admin: '/account/admin.html', account: '/account/', about: '/about/', privacy: '/legal/privacy', terms: '/legal/terms' };
  let source = '';
  try { source = new URL(referrer).origin + '/'; } catch (_) {}
  return { page_location: url.origin + paths[section], page_referrer: source, page_title: `World Explorer — ${section}`, site_section: section };
}

export async function getAnalyticsTools(config = globalThis.WORLD_EXPLORER_FIREBASE) {
  assertFirebaseEnvironment(config);
  if (tools) return tools;
  if (pending) return pending;
  if (!config?.measurementId || Date.now() < retryAfter) return null;
  pending = (async () => {
    const [apps, mod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js')
    ]);
    if (!await mod.isSupported()) return null;
    const app = apps.getApps().length ? apps.getApp() : apps.initializeApp(config);
    assertFirebaseEnvironment(app.options);
    mod.setConsent({ analytics_storage: analyticsStorageAllowed() ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    const analytics = mod.initializeAnalytics(app, { config: { ...analyticsPageContext(), ...entryCampaign, ...analyticsEventContext(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false } });
    tools = { analytics, ...mod };
    globalThis.addEventListener?.('we3d:analytics-consent', () => {
      mod.setConsent({ analytics_storage: analyticsStorageAllowed() ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      if (!analyticsStorageAllowed()) mod.setUserId(analytics, null);
    });
    return tools;
  })().catch(() => null).then(result => {
    if (!result) retryAfter = Date.now() + 10000;
    return result;
  }).finally(() => { pending = null; });
  return pending;
}
