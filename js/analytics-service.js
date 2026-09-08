import { analyticsStorageAllowed } from './analytics-consent.js?v=3';

let tools;
let pending;
let retryAfter = 0;
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
    mod.setConsent({ analytics_storage: analyticsStorageAllowed() ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    const analytics = mod.initializeAnalytics(app, { config: { ...analyticsPageContext(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false } });
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
