import { analyticsEventContext, analyticsPageContext, getAnalyticsTools } from './analytics-service.js?v=2';
import { analyticsStorageAllowed, writeAnalyticsConsent } from './analytics-consent.js?v=3';

// One page owner; gameplay retains ownership of its existing world-session events.
const state = { pageQueued: false, attempts: 0, sdkReady: false, queuedEvents: 0 };
const queue = [];
let flushing = false;
let retryTimer;
globalThis.getWorldExplorerSiteAnalyticsSnapshot = () => ({ ...state, delivery: 'SDK queue is not proof of server receipt' });
async function flush() {
  if (flushing) return;
  flushing = true;
  state.attempts++;
  try {
    const tools = await getAnalyticsTools();
    if (!tools) {
      if (state.attempts < 3 && !retryTimer) retryTimer = setTimeout(() => { retryTimer = null; void flush(); }, 11000);
      return;
    }
    state.sdkReady = true;
    if (!state.pageQueued) {
      tools.logEvent(tools.analytics, 'page_view', { ...analyticsPageContext(), ...analyticsEventContext() });
      state.pageQueued = true;
    }
    while (queue.length) {
      const event = queue.shift();
      tools.logEvent(tools.analytics, event.name, { ...analyticsPageContext(), ...analyticsEventContext(), ...event.params });
      state.queuedEvents++;
    }
  } catch (_) {
    // Measurement must never interrupt navigation or gameplay.
    state.sdkReady = false;
  } finally { flushing = false; }
}
function record(name, params = {}) {
  if (queue.length < 20) queue.push({ name, params });
  if (state.attempts < 3 || state.sdkReady) void flush();
}
document.addEventListener('click', event => {
  const element = event.target.closest?.('#landingPrimaryCta, #globeSelectorStartBtn, #globeSelectorMoonBtn, #globeSelectorMarsBtn, #globeSelectorSpaceBtn, #globeSelectorOceanBtn');
  if (!element) {
    const link = event.target.closest?.('a[href]');
    if (link && new URL(link.href).origin === location.origin && /^\/app\/(?:index.html)?$/.test(new URL(link.href).pathname)) record('we3d_play_click', { destination: 'start_menu' });
    return;
  }
  const destinations = { globeSelectorStartBtn: 'earth', globeSelectorMoonBtn: 'moon', globeSelectorMarsBtn: 'mars', globeSelectorSpaceBtn: 'space', globeSelectorOceanBtn: 'ocean' };
  record(element.id === 'landingPrimaryCta' ? 'we3d_play_click' : 'we3d_destination_select', { destination: destinations[element.id] || 'start_menu' });
}, { capture: true });
// Launches must be observable before lazy gameplay services start. A failed
// world may never start those services at all. This page owner handles them once.
const launchEvents = new Set(['we3d_launch_start', 'we3d_launch_ready', 'we3d_launch_failed', 'we3d_launch_abandoned']);
function recordLaunch(detail) {
  if (!launchEvents.has(detail?.name)) return;
  const p = detail.params || {};
  record(detail.name, {
    environment: ['earth', 'ocean', 'moon', 'mars', 'space'].includes(p.environment) ? p.environment : 'unknown',
    launch_index: Math.max(1, Math.floor(Number(p.launch_index) || 1)),
    ...(Number.isFinite(p.load_duration_ms) ? { load_duration_ms: Math.max(0, Math.min(1800000, Math.round(p.load_duration_ms))) } : {}),
    ...(['launch_failed', 'world_not_ready', 'page_hidden', 'page_closed'].includes(p.failure_reason) ? { failure_reason: p.failure_reason } : {})
  });
}
globalThis.addEventListener('we3d:product-telemetry', event => recordLaunch(event.detail));
for (const detail of globalThis.__WE3D_PRODUCT_TELEMETRY_QUEUE__ || []) recordLaunch(detail);
globalThis.addEventListener('we3d:runtime-ready', () => record('we3d_menu_ready'), { once: true });
globalThis.addEventListener('we3d:first-play-ready', event => {
  const duration = Number(event.detail?.loadDurationMs);
  record('we3d_first_play_ready', {
    environment: ['earth', 'ocean', 'moon', 'mars', 'space'].includes(event.detail?.environment) ? event.detail.environment : 'unknown',
    ...(Number.isFinite(duration) ? { load_duration_ms: Math.max(0, Math.min(1800000, Math.round(duration))) } : {})
  });
}, { once: true });
function addPreferenceControl() {
  if (document.getElementById('analyticsConsentManageBtn')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'siteAnalyticsPreference';
  button.style.cssText = 'display:block;margin:16px auto;padding:10px 14px;border:1px solid #557b89;border-radius:6px;background:#0b2029;color:#ecf5f7;font:inherit;cursor:pointer';
  const sync = () => { button.textContent = analyticsStorageAllowed() ? 'Analytics: standard — switch to limited' : 'Analytics: limited — switch to standard'; };
  button.addEventListener('click', () => writeAnalyticsConsent(analyticsStorageAllowed() ? 'denied' : 'granted'));
  globalThis.addEventListener('we3d:analytics-consent', sync);
  sync();
  (document.querySelector('body > footer') || document.body).append(button);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addPreferenceControl, { once: true });
else addPreferenceControl();
void flush();
