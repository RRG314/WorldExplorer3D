import { initFirebaseAuth } from './firebase-auth-init.js';

let cachedAnalytics = undefined;
let cachedAnalyticsPromise = null;

async function initFirebaseAnalytics() {
  if (cachedAnalytics !== undefined) return cachedAnalytics;
  if (cachedAnalyticsPromise) return cachedAnalyticsPromise;

  cachedAnalyticsPromise = (async () => {
    const services = initFirebaseAuth();
    const measurementId = String(services?.config?.measurementId || '').trim();
    if (!services?.app || !measurementId || typeof window === 'undefined') {
      cachedAnalytics = null;
      return cachedAnalytics;
    }

    try {
      const analyticsModule = await import('../app/js/platform/firebase/analytics.js');
      const supported = typeof analyticsModule.isSupported === 'function'
        ? await analyticsModule.isSupported().catch(() => false)
        : false;
      if (!supported) {
        cachedAnalytics = null;
        return cachedAnalytics;
      }
      cachedAnalytics = analyticsModule.getAnalytics(services.app);
      return cachedAnalytics;
    } catch (_) {
      cachedAnalytics = null;
      return cachedAnalytics;
    }
  })().finally(() => {
    cachedAnalyticsPromise = null;
  });

  return cachedAnalyticsPromise;
}

export { initFirebaseAnalytics };
