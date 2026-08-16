import { ctx as appCtx } from "./shared-context.js?v=55";
import { clearPolice, spawnPolice, updatePolice } from "./game/police.js?v=2";
import {
  clearObjectives,
  getActiveGameplayLeaderboard,
  getGameplayRegistrySnapshot,
  pickRoadPt,
  registerGameplayPlugin,
  saveActiveGameplay,
  spawnCheckpoints,
  spawnDest,
  startGameplayPlugin,
  startMode,
  stopGameplayPlugin,
  updateMode
} from "./game/modes.js?v=7";
import {
  applyPaintTownRemoteClaimsFromSync,
  clearPaintTownMultiplayerConfig,
  firePaintball,
  paintTownDebugSnapshot,
  setPaintTownMultiplayerConfig,
  setPaintTownPlayerColor,
  startPaintTownMode,
  stopPaintTownMode,
  tryTouchPaintAt,
  updatePaintballProjectiles
} from "./game/paint-town.js?v=1";
import {
  clearNavigation,
  closeLegend,
  closeMapInfo,
  createNavigationRoute,
  describeDestinationEntrySupport,
  getNavigationTargetForDestination,
  navigateToPOI,
  renderInteriorLegend,
  toggleAllGameElements,
  toggleAllLayers,
  toggleAllPOIs,
  togglePathOverlays,
  toggleRoads,
  updateMapLayers,
  updateNavigationRoute,
  updateNearbyPOI
} from "./game/navigation-ui.js?v=1";
import {
  clearPropertyMarkers,
  closeModal,
  closePropertyPanel,
  createPropertyCard,
  loadPropertiesAtCurrentLocation,
  navigateToProperty,
  openModalById,
  renderPropertyMarkers,
  togglePropertyFilters,
  toggleRealEstate,
  updatePropertyPanel
} from "./game/property-ui.js?v=1";
import {
  closeHistoricPanel,
  createHistoricCard,
  navigateToHistoric,
  openHistoricModal,
  toggleHistoric,
  updateHistoricPanel
} from "./game/historic-ui.js?v=1";
import { escapeHtml, escapeJsString, formatPrice, toFiniteNumber } from "./game/ui-utils.js?v=1";

function isPOIVisible(poiType) {
  const categoryMap = {
    'amenity=school': 'schools',
    'amenity=university': 'schools',
    'amenity=hospital': 'healthcare',
    'amenity=clinic': 'healthcare',
    'amenity=pharmacy': 'healthcare',
    'amenity=police': 'emergency',
    'amenity=fire_station': 'emergency',
    'amenity=restaurant': 'food',
    'amenity=cafe': 'food',
    'amenity=fast_food': 'food',
    'amenity=bar': 'food',
    'amenity=pub': 'food',
    'shop=supermarket': 'shopping',
    'shop=mall': 'shopping',
    'shop=convenience': 'shopping',
    'tourism=museum': 'culture',
    'tourism=attraction': 'tourism',
    'tourism=viewpoint': 'tourism',
    'tourism=hotel': 'hotels',
    'tourism=artwork': 'culture',
    'historic=monument': 'historic',
    'historic=memorial': 'historic',
    'leisure=park': 'parks',
    'leisure=playground': 'parks',
    'leisure=sports_centre': 'parks',
    'leisure=stadium': 'parks',
    'amenity=parking': 'parking',
    'amenity=fuel': 'fuel',
    'amenity=bank': 'banks',
    'amenity=post_office': 'postal'
  };
  const category = categoryMap[poiType];
  return category ? appCtx.mapLayers[category] : false;
}

function showMapInfo(type, data) {
  const panel = document.getElementById('mapInfoPanel');
  const title = document.getElementById('mapInfoTitle');
  const content = document.getElementById('mapInfoContent');
  panel.style.display = 'block';

  if (type === 'deflock') {
    title.textContent = '📷 Mapped Virtual Camera';
    const direction = Number.isFinite(Number(data.direction)) ? `${Number(data.direction).toFixed(0)}°` : 'Unknown';
    const status = data.state === 'disabled' ? 'Virtually disabled' : data.state === 'discovered' ? 'Discovered' : 'Undiscovered';
    content.innerHTML = `
      <div style="margin-bottom:10px;color:#e6faff"><strong>${escapeHtml(status)}</strong></div>
      <div>Type: <strong>${escapeHtml(data.cameraType || data.surveillanceType || 'Unknown')}</strong></div>
      <div>Mapped direction: <strong>${escapeHtml(direction)}</strong></div>
      <div>Operator: <strong>${escapeHtml(data.operator || 'Unknown')}</strong></div>
      <div>Manufacturer: <strong>${escapeHtml(data.manufacturer || 'Unknown')}</strong></div>
      <div>Source: <strong>${escapeHtml(data.sourceDataset || 'OpenStreetMap')}</strong></div>
      <div>Source ID: <strong>${escapeHtml(data.sourceId || 'Unknown')}</strong></div>
      <div>Last mapped timestamp: <strong>${escapeHtml(data.sourceTimestamp || 'Unknown')}</strong></div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,255,204,.35);font-size:10px;opacity:.82">Public community mapping can be incomplete or outdated. Detection is a gameplay approximation. Virtual actions do not affect physical infrastructure.</div>
      <div style="margin-top:8px"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:#67e8f9">© OpenStreetMap contributors • ODbL</a></div>
    `;
    return;
  }

  if (type === 'property') {
    title.textContent = '🏠 Property Details';
    const entrySupportText = describeDestinationEntrySupport(data);
    const distance = Math.round(Math.hypot(toFiniteNumber(data.x, 0) - appCtx.car.x, toFiniteNumber(data.z, 0) - appCtx.car.z));
    const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
    const safeId = escapeJsString(data.id);
    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${formatPrice(toFiniteNumber(data.price, 0))}${data.priceType === 'rent' ? '/mo' : ''}</div>
        <div style="font-size:12px;opacity:0.9;margin-bottom:4px">${escapeHtml(data.address || 'Address unavailable')}</div>
        <div style="font-size:11px;opacity:0.8">${escapeHtml(data.city || '')}, ${escapeHtml(data.state || '')} ${escapeHtml(data.zipCode || '')}</div>
      </div>
      <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
        <div>🛏️ <strong>${toFiniteNumber(data.beds, 0)}</strong> beds</div>
        <div>🚿 <strong>${toFiniteNumber(data.baths, 0)}</strong> baths</div>
        <div>📐 <strong>${toFiniteNumber(data.sqft, 0)}</strong> sqft</div>
        <div>📅 <strong>${escapeHtml(data.yearBuilt || 'N/A')}</strong></div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div>
        <div style="opacity:0.8">🏷️ Type: <strong>${escapeHtml(data.propertyType || 'Unknown')}</strong></div>
        <div style="opacity:0.8">🚪 Entry: <strong>${escapeHtml(entrySupportText)}</strong></div>
      </div>
      <button onclick="navigateToProperty('${safeId}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
      <button onclick="openModalById('${safeId}'); closeMapInfo();" style="width:100%;background:rgba(0,255,200,0.2);color:#0fc;border:1px solid #0fc;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
    `;
    return;
  }

  if (type === 'poi') {
    title.textContent = `${data.icon || '📍'} ${data.category || 'POI'}`;
    const safeX = toFiniteNumber(data.x, 0);
    const safeZ = toFiniteNumber(data.z, 0);
    const safeName = escapeHtml(data.name || 'Point of Interest');
    const safeNameJs = escapeJsString(data.name || 'POI');
    const distance = Math.round(Math.hypot(safeX - appCtx.car.x, safeZ - appCtx.car.z));
    const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${safeName}</div>
        <div style="font-size:11px;opacity:0.8">${escapeHtml(data.category || 'POI')}</div>
      </div>
      <div style="margin-bottom:12px;font-size:10px"><div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div></div>
      <button onclick="navigateToPOI(${safeX}, ${safeZ}, '${safeNameJs}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px">🧭 NAVIGATE HERE</button>
    `;
    return;
  }

  title.textContent = '⛩️ Historic Site';
  const safeName = escapeHtml(data.name || 'Historic Site');
  const safeNameJs = escapeJsString(data.name || 'Historic Site');
  const distance = Math.round(Math.hypot(toFiniteNumber(data.x, 0) - appCtx.car.x, toFiniteNumber(data.z, 0) - appCtx.car.z));
  const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
  content.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:16px;font-weight:bold;color:#f59e0b;margin-bottom:6px">${safeName}</div>
      <div style="font-size:11px;opacity:0.8">${escapeHtml(data.category || 'Historic')}</div>
    </div>
    <div style="margin-bottom:12px;font-size:10px">
      <div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div>
      <div style="opacity:0.8">🚪 Entry: <strong>${escapeHtml(describeDestinationEntrySupport(data))}</strong></div>
    </div>
    <button onclick="navigateToHistoric('${safeNameJs}'); closeMapInfo();" style="width:100%;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
    <button onclick="openHistoricModal('${safeNameJs}'); closeMapInfo();" style="width:100%;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid #f59e0b;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
  `;
}

function fmtTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
}

function showResult(title, stats) {
  document.getElementById('resultTitle').textContent = title;
  document.getElementById('resultStats').textContent = stats;
  document.getElementById('resultScreen').classList.add('show');
  appCtx.setPauseReason?.('game_result', true);
}

function hideResult() {
  document.getElementById('resultScreen').classList.remove('show');
}

Object.assign(appCtx, {
  applyPaintTownRemoteClaimsFromSync,
  clearNavigation,
  clearPaintTownMultiplayerConfig,
  clearObjectives,
  clearPolice,
  clearPropertyMarkers,
  closeHistoricPanel,
  closeLegend,
  closeMapInfo,
  closeModal,
  closePropertyPanel,
  createHistoricCard,
  createNavigationRoute,
  createPropertyCard,
  fmtTime,
  formatPrice,
  getActiveGameplayLeaderboard,
  getGameplayRegistrySnapshot,
  hideResult,
  isPOIVisible,
  loadPropertiesAtCurrentLocation,
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openHistoricModal,
  openModalById,
  paintTownDebugFirePaintballAt: firePaintball,
  paintTownDebugTryTouchPaintAt: tryTouchPaintAt,
  paintTownDebugUpdatePaintballs: updatePaintballProjectiles,
  paintTownDebugSnapshot,
  pickRoadPt,
  registerGameplayPlugin,
  renderInteriorLegend,
  renderPropertyMarkers,
  saveActiveGameplay,
  showMapInfo,
  showResult,
  setPaintTownMultiplayerConfig,
  setPaintTownPlayerColor,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startGameplayPlugin,
  startPaintTownMode,
  startMode,
  stopGameplayPlugin,
  stopPaintTownMode,
  toggleAllGameElements,
  toggleAllLayers,
  toggleAllPOIs,
  toggleHistoric,
  togglePropertyFilters,
  toggleRealEstate,
  toggleRoads,
  togglePathOverlays,
  updateHistoricPanel,
  updateMapLayers,
  updateMode,
  updateNavigationRoute,
  updateNearbyPOI,
  updatePolice,
  updatePropertyPanel
});

export {
  applyPaintTownRemoteClaimsFromSync,
  clearNavigation,
  clearPaintTownMultiplayerConfig,
  clearObjectives,
  clearPolice,
  clearPropertyMarkers,
  closeHistoricPanel,
  closeLegend,
  closeMapInfo,
  closeModal,
  closePropertyPanel,
  createHistoricCard,
  createNavigationRoute,
  createPropertyCard,
  fmtTime,
  formatPrice,
  getActiveGameplayLeaderboard,
  getGameplayRegistrySnapshot,
  hideResult,
  isPOIVisible,
  loadPropertiesAtCurrentLocation,
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openHistoricModal,
  openModalById,
  pickRoadPt,
  registerGameplayPlugin,
  renderInteriorLegend,
  renderPropertyMarkers,
  saveActiveGameplay,
  showMapInfo,
  showResult,
  setPaintTownMultiplayerConfig,
  setPaintTownPlayerColor,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startGameplayPlugin,
  startPaintTownMode,
  startMode,
  stopGameplayPlugin,
  stopPaintTownMode,
  toggleAllGameElements,
  toggleAllLayers,
  toggleAllPOIs,
  toggleHistoric,
  togglePropertyFilters,
  toggleRealEstate,
  toggleRoads,
  togglePathOverlays,
  updateHistoricPanel,
  updateMapLayers,
  updateMode,
  updateNavigationRoute,
  updateNearbyPOI,
  updatePolice,
  updatePropertyPanel
};
