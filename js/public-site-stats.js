import { readFirebaseConfig } from './firebase-init.js?v=57';

function publicStatsCandidates() {
  const config = readFirebaseConfig();
  const projectId = String(config?.projectId || '').trim();
  const direct = projectId
    ? `https://us-central1-${projectId}.cloudfunctions.net/getPublicSiteStats`
    : '';
  const local = `${globalThis.location?.origin || ''}/getPublicSiteStats`;
  const hostname = String(globalThis.location?.hostname || '').toLowerCase();
  const localPreview = hostname === 'localhost' || hostname === '127.0.0.1';
  return [...new Set((localPreview ? [direct, local] : [local, direct]).filter(Boolean))];
}

function normalizePublicSiteStats(payload = {}) {
  const totalUsers = Number(payload.totalUsers);
  if (!Number.isSafeInteger(totalUsers) || totalUsers < 0) return null;
  return Object.freeze({ totalUsers });
}

async function fetchPublicSiteStats() {
  for (const url of publicStatsCandidates()) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) continue;
      const stats = normalizePublicSiteStats(await response.json());
      if (stats) return stats;
    } catch (_) {
      // Try the next configured hosting or direct Functions route.
    }
  }
  return null;
}

async function hydratePublicExplorerCount(root = document) {
  const container = root.querySelector('#landingExplorerCount');
  const value = root.querySelector('#landingExplorerCountValue');
  if (!container || !value) return null;
  const stats = await fetchPublicSiteStats();
  if (!stats) return null;
  value.textContent = new Intl.NumberFormat().format(stats.totalUsers);
  const label = container.querySelector('.community-count-label');
  if (label) {
    label.textContent = stats.totalUsers === 1
      ? 'explorer has joined'
      : 'explorers have joined';
  }
  container.hidden = false;
  container.setAttribute('aria-label', `${stats.totalUsers.toLocaleString()} registered ${stats.totalUsers === 1 ? 'explorer' : 'explorers'}`);
  return stats;
}

export {
  fetchPublicSiteStats,
  hydratePublicExplorerCount,
  normalizePublicSiteStats
};
