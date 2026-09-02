import { ctx as appCtx } from "../shared-context.js?v=55";
import { clearNavigation, createNavigationRoute, describeDestinationEntrySupport, getNavigationTargetForDestination } from "./navigation-ui.js?v=1";
import { escapeHtml, escapeJsString, toFiniteNumber } from "./ui-utils.js?v=1";
import { closeModal, updatePropertyPanel } from "./property-ui.js?v=3";

export function toggleHistoric() {
  appCtx.historicMode = !appCtx.historicMode;
  const btn = document.getElementById('historicBtn');
  if (btn) btn.classList.toggle('active', appCtx.historicMode);
  if (appCtx.historicMode) updateHistoricPanel();
  else closeHistoricPanel();
}

export function updateHistoricPanel() {
  const list = document.getElementById('historicList');
  if (!list || !appCtx.historicMode) return;

  appCtx.historicSites.forEach((site) => {
    const dx = site.x - appCtx.car.x;
    const dz = site.z - appCtx.car.z;
    site.distance = Math.sqrt(dx * dx + dz * dz);
  });
  appCtx.historicSites.sort((a, b) => a.distance - b.distance);
  document.getElementById('historicCount').textContent = `${appCtx.historicSites.length} Sites`;
  list.innerHTML = appCtx.historicSites.map(createHistoricCard).join('');
  document.getElementById('historicPanel').classList.add('show');
}

export function createHistoricCard(site) {
  const distance = Math.round(toFiniteNumber(site.distance, 0));
  const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
  const isSelected = appCtx.selectedHistoric && appCtx.selectedHistoric.name === site.name;
  const safeName = escapeHtml(site.name || 'Historic Site');
  const safeNameJs = escapeJsString(site.name || 'Historic Site');
  const safeCategory = escapeHtml(site.category || 'Historic');
  const safeIcon = escapeHtml(site.icon || '⛩️');

  return `
    <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer;transition:all 0.2s" onclick="openHistoricModal('${safeNameJs}')">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
        <div style="font-size:16px;font-weight:700;color:#78350f;flex:1">${safeIcon} ${safeName}</div>
        <div style="font-size:11px;color:#d97706;font-weight:600;background:#fff;padding:3px 6px;border-radius:4px">📍 ${escapeHtml(distanceText)}</div>
      </div>
      <div style="font-size:11px;color:#92400e;margin-bottom:8px">${safeCategory}</div>
      <button onclick="event.stopPropagation(); navigateToHistoric('${safeNameJs}')" style="width:100%;background:${isSelected ? '#10b981' : '#f59e0b'};border:none;border-radius:6px;padding:6px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;font-size:11px;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Get Directions'}
      </button>
    </div>
  `;
}

export async function openHistoricModal(siteName) {
  const site = appCtx.historicSites.find((entry) => entry.name === siteName);
  if (!site || !appCtx.PropertyUI.modal) return;

  appCtx.PropertyUI.modalTitle.textContent = site.name || 'Historic Site';
  const safeNameJs = escapeJsString(site.name || 'Historic Site');
  const safeCategory = escapeHtml(site.category || 'Historic');
  const safeIcon = escapeHtml(site.icon || '⛩️');
  const safeLat = toFiniteNumber(site.lat, 0).toFixed(4);
  const safeLon = toFiniteNumber(site.lon, 0).toFixed(4);

  let fact = 'Historic site with cultural significance.';
  const wikidataId = typeof site.wikidata === 'string' ? site.wikidata.trim() : '';
  if (wikidataId && /^[A-Za-z0-9_-]+$/.test(wikidataId)) {
    try {
      const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
      if (response.ok) {
        const data = await response.json();
        const entity = data.entities[wikidataId];
        if (entity && entity.descriptions && entity.descriptions.en) {
          fact = entity.descriptions.en.value;
        }
      }
    } catch {
      console.warn('Could not fetch Wikidata info');
    }
  }

  const distance = Math.round(toFiniteNumber(site.distance, 0));
  const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
  const isSelected = appCtx.selectedHistoric && appCtx.selectedHistoric.name === site.name;
  const entrySupportText = describeDestinationEntrySupport(site);
  const wikiSlug = typeof site.wikipedia === 'string' ? site.wikipedia.trim().replace(/\s+/g, '_') : '';
  const wikiUrl = wikiSlug ? `https://wikipedia.org/wiki/${encodeURIComponent(wikiSlug)}` : '';
  const navButtons = `
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="navigateToHistoric('${safeNameJs}')" style="flex:1;background:${isSelected ? '#10b981' : '#f59e0b'};border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Navigate Here'}
      </button>
      ${isSelected ? `<button onclick="clearNavigation()" style="flex:1;background:#ef4444;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">✕ Clear Route</button>` : ''}
    </div>
  `;

  appCtx.PropertyUI.modalBody.innerHTML = `
    <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#78350f">
      <strong>⛩️ Historic Site</strong><br>
      ${escapeHtml(fact)}
    </div>
    <div style="width:100%;height:200px;background:#f5f5f5;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">${safeIcon}</div>
    <div class="prop-stat"><span class="prop-stat-label">Type</span><span class="prop-stat-value">${safeCategory}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Distance</span><span class="prop-stat-value">${escapeHtml(distanceText)}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Entry Support</span><span class="prop-stat-value">${escapeHtml(entrySupportText)}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Location</span><span class="prop-stat-value">${safeLat}, ${safeLon}</span></div>
    ${navButtons}
    ${wikiUrl ? `<button onclick="window.open('${escapeJsString(wikiUrl)}','_blank','noopener,noreferrer')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">📖 Wikipedia</button>` : ''}
  `;
  appCtx.PropertyUI.modal.classList.add('show');
}

export function navigateToHistoric(siteName) {
  const site = appCtx.historicSites.find((entry) => entry.name === siteName);
  if (!site) return;

  appCtx.selectedHistoric = site;
  appCtx.selectedProperty = null;
  appCtx.showNavigation = true;

  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const target = getNavigationTargetForDestination(site);
  createNavigationRoute(ref.x, ref.z, target.x, target.z, true);
  updateHistoricPanel();
  closeModal();
}

export function closeHistoricPanel() {
  document.getElementById('historicPanel').classList.remove('show');
}
