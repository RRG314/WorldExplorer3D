import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// game.js - Game modes, police, POI, real estate UI, historic sites, navigation
// ============================================================================

function updateNearbyPOI() {
  const poiInfo = document.getElementById('poiInfo');

  // Only update POI display if POI mode is enabled
  if (!appCtx.poiMode) {
    if (appCtx.nearestPOI) {
      appCtx.nearestPOI = null;
      poiInfo.style.display = 'none';
    }
    return;
  }

  let closest = null;
  let minDist = Infinity;

  appCtx.pois.forEach((poi) => {
    const dx = poi.x - appCtx.car.x;
    const dz = poi.z - appCtx.car.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < minDist && dist < 150) {// Within 150m
      minDist = dist;
      closest = { ...poi, dist };
    }
  });

  if (closest && (closest !== appCtx.nearestPOI || Math.abs(closest.dist - appCtx.nearestPOI?.dist) > 5)) {
    appCtx.nearestPOI = closest;
    document.getElementById('poiIcon').textContent = closest.icon;
    document.getElementById('poiName').textContent = closest.name;
    document.getElementById('poiCategory').textContent = closest.category;
    document.getElementById('poiDistance').textContent = Math.floor(closest.dist) + 'm ahead';
    poiInfo.style.display = 'block';
  } else if (!closest && appCtx.nearestPOI) {
    appCtx.nearestPOI = null;
    poiInfo.style.display = 'none';
  }
}

// ==================== REAL ESTATE UI FUNCTIONS ====================

function formatPrice(v) {
  return '$' + Math.round(v).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function escapeJsString(value) {
  return String(value ?? '').
  replace(/\\/g, '\\\\').
  replace(/'/g, "\\'").
  replace(/\r/g, '').
  replace(/\n/g, '\\n').
  replace(/</g, '\\x3C').
  replace(/>/g, '\\x3E');
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeHttpUrl(raw) {
  if (!raw) return '';
  try {
    const baseHref = globalThis.location && globalThis.location.href ? globalThis.location.href : 'https://example.com/';
    const parsed = new URL(String(raw), baseHref);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    return '';
  } catch {
    return '';
  }
}

function createPropertyCard(p) {
  const safeId = escapeJsString(p.id);
  const safeAddress = escapeHtml(p.address || 'Address unavailable');
  const safePrice = toFiniteNumber(p.price, 0);
  const safeBeds = toFiniteNumber(p.beds, 0);
  const safeBaths = toFiniteNumber(p.baths, 0);
  const safeSqft = Math.round(toFiniteNumber(p.sqft, 0));
  const safeLat = toFiniteNumber(p.lat, 0);
  const safeLon = toFiniteNumber(p.lon, 0);
  const safePrimaryPhoto = sanitizeHttpUrl(p.primaryPhoto);

  // Photo with intelligent fallback
  let photoHTML;
  if (safePrimaryPhoto) {
    photoHTML = `<img src="${escapeHtml(safePrimaryPhoto)}" alt="${safeAddress}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${safeLat},${safeLon}&key=YOUR_API_KEY&source=outdoor'">`;
  } else {
    // Fallback to street view if available (will show generic placeholder if street view fails)
    photoHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;color:white">
      <div style="font-size:48px;margin-bottom:8px">🏠</div>
      <div style="font-size:10px;opacity:0.8">Photo Unavailable</div>
    </div>`;
  }

  // Source badge
  const sourceBadges = {
    demo: { color: '#fbbf24', text: 'DEMO', bgColor: '#fef3c7' },
    estated: { color: '#10b981', text: 'ESTATED', bgColor: '#d1fae5' },
    attom: { color: '#8b5cf6', text: 'ATTOM', bgColor: '#ede9fe' },
    rentcast: { color: '#3b82f6', text: 'RENTCAST', bgColor: '#dbeafe' }
  };

  const badge = sourceBadges[p.source] || sourceBadges.demo;
  const sourceTag = `<div style="position:absolute;top:6px;right:6px;background:${badge.bgColor};color:${badge.color};padding:3px 6px;border-radius:4px;font-size:9px;font-weight:700;border:1px solid ${badge.color}">${badge.text}</div>`;

  const isSelected = appCtx.selectedProperty && appCtx.selectedProperty.id === p.id;
  const distance = Math.round(toFiniteNumber(p.distance, 0));
  const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';

  return `
  <div class="property-card" onclick="openModalById('${safeId}')" style="position:relative;margin-bottom:10px">
    <div class="prop-photo" style="height:140px">${photoHTML}${sourceTag}</div>
    <div class="prop-info">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <div class="prop-price" style="font-size:18px">${formatPrice(safePrice)}${p.priceType === 'rent' ? '/mo' : ''}</div>
        <div style="font-size:11px;color:#10b981;font-weight:600;background:#d1fae5;padding:3px 6px;border-radius:4px">📍 ${escapeHtml(distanceText)}</div>
      </div>
      <div class="prop-address" style="font-size:12px">${safeAddress}</div>
      <div class="prop-details" style="font-size:11px;gap:8px">🛏 ${safeBeds} 🚿 ${safeBaths} 📐 ${safeSqft}</div>
      <button onclick="event.stopPropagation(); navigateToProperty('${safeId}')" style="width:100%;background:${isSelected ? '#10b981' : '#667eea'};border:none;border-radius:6px;padding:6px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;font-size:11px;margin-top:6px;transition:all 0.2s">${isSelected ? '✓ Navigating' : '🧭 Navigate'}</button>
    </div>
  </div>`;
}

function updatePropertyPanel() {
  if (!appCtx.PropertyUI.list) return;

  // Calculate distances and add to properties
  appCtx.properties.forEach((p) => {
    const dx = p.x - appCtx.car.x;
    const dz = p.z - appCtx.car.z;
    p.distance = Math.sqrt(dx * dx + dz * dz);
  });

  // Filter by radius
  const radiusMeters = appCtx.propertyRadius * 1000;
  let filtered = appCtx.properties.filter((p) => p.distance <= radiusMeters);

  // Filter by property type (sale/rent/all)
  if (appCtx.propertyTypeFilter !== 'all') {
    filtered = filtered.filter((p) => p.priceType === appCtx.propertyTypeFilter);
  }

  // Sort properties
  switch (appCtx.propertySort) {
    case 'distance':
      filtered.sort((a, b) => a.distance - b.distance);
      break;
    case 'price-low':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price-high':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'beds':
      filtered.sort((a, b) => b.beds - a.beds);
      break;
    case 'sqft':
      filtered.sort((a, b) => b.sqft - a.sqft);
      break;
  }

  // Update count and source display
  document.getElementById('propertyCount').textContent = `${filtered.length} Properties`;
  const sources = {};
  appCtx.properties.forEach((p) => sources[p.source] = (sources[p.source] || 0) + 1);
  const sourceText = Object.entries(sources).map(([k, v]) => `${v} ${k}`).join(', ');
  document.getElementById('propertySource').textContent = sourceText;

  // Update data source label in header
  const hasRealData = appCtx.properties.some((p) => !p.isDemo && p.source !== 'demo');
  const primarySource = hasRealData ?
  appCtx.properties.find((p) => p.source === 'rentcast') ? 'RentCast (Live)' :
  appCtx.properties.find((p) => p.source === 'estated') ? 'Estated (Live)' :
  appCtx.properties.find((p) => p.source === 'attom') ? 'ATTOM (Live)' : 'Demo Data' :
  'Demo Data';
  document.getElementById('dataSourceLabel').textContent = `Source: ${primarySource}`;

  // Render cards
  appCtx.PropertyUI.list.innerHTML = filtered.map(createPropertyCard).join('');
  if (appCtx.PropertyUI.panel) appCtx.PropertyUI.panel.classList.add('show');
}

function togglePropertyFilters() {
  const filters = document.getElementById('propertyFilters');
  const icon = document.getElementById('filterToggleIcon');
  if (filters && icon) {
    const isHidden = filters.style.display === 'none';
    filters.style.display = isHidden ? 'block' : 'none';
    icon.textContent = isHidden ? '▲' : '▼';
  }
}

function isPOIVisible(poiType) {
  // Map POI types to layer settings
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

function closeLegend() {
  document.getElementById('legendPanel').style.display = 'none';
}

function updateMapLayers() {
  appCtx.mapLayers.properties = document.getElementById('filterProperties').checked;
  appCtx.mapLayers.navigation = document.getElementById('filterNavigation').checked;
  appCtx.mapLayers.schools = document.getElementById('filterSchools').checked;
  appCtx.mapLayers.healthcare = document.getElementById('filterHealthcare').checked;
  appCtx.mapLayers.emergency = document.getElementById('filterEmergency').checked;
  appCtx.mapLayers.food = document.getElementById('filterFood').checked;
  appCtx.mapLayers.shopping = document.getElementById('filterShopping').checked;
  appCtx.mapLayers.culture = document.getElementById('filterCulture').checked;
  appCtx.mapLayers.historic = document.getElementById('filterHistoric').checked;
  appCtx.mapLayers.parks = document.getElementById('filterParks').checked;
  appCtx.mapLayers.parking = document.getElementById('filterParking').checked;
  appCtx.mapLayers.fuel = document.getElementById('filterFuel').checked;
  appCtx.mapLayers.banks = document.getElementById('filterBanks').checked;
  appCtx.mapLayers.postal = document.getElementById('filterPostal').checked;
  appCtx.mapLayers.hotels = document.getElementById('filterHotels').checked;
  appCtx.mapLayers.tourism = document.getElementById('filterTourism').checked;
  appCtx.mapLayers.checkpoints = document.getElementById('filterCheckpoints').checked;
  appCtx.mapLayers.destination = document.getElementById('filterDestination').checked;
  appCtx.mapLayers.customTrack = document.getElementById('filterCustomTrack').checked;
  appCtx.mapLayers.police = document.getElementById('filterPolice').checked;
  appCtx.mapLayers.memoryPins = document.getElementById('filterMemoryPins').checked;
  appCtx.mapLayers.memoryFlowers = document.getElementById('filterMemoryFlowers').checked;

  // Update parent checkboxes
  const allPOIs = appCtx.mapLayers.schools && appCtx.mapLayers.healthcare && appCtx.mapLayers.emergency &&
  appCtx.mapLayers.food && appCtx.mapLayers.shopping && appCtx.mapLayers.culture &&
  appCtx.mapLayers.historic && appCtx.mapLayers.parks && appCtx.mapLayers.parking &&
  appCtx.mapLayers.fuel && appCtx.mapLayers.banks && appCtx.mapLayers.postal &&
  appCtx.mapLayers.hotels && appCtx.mapLayers.tourism;
  document.getElementById('filterPOIsAll').checked = allPOIs;

  const allGameElements = appCtx.mapLayers.checkpoints && appCtx.mapLayers.destination && appCtx.mapLayers.customTrack;
  document.getElementById('filterGameElementsAll').checked = allGameElements;
}

function toggleAllLayers(state) {
  document.getElementById('filterProperties').checked = state;
  document.getElementById('filterNavigation').checked = state;
  document.getElementById('filterPOIsAll').checked = state;
  document.getElementById('filterSchools').checked = state;
  document.getElementById('filterHealthcare').checked = state;
  document.getElementById('filterEmergency').checked = state;
  document.getElementById('filterFood').checked = state;
  document.getElementById('filterShopping').checked = state;
  document.getElementById('filterCulture').checked = state;
  document.getElementById('filterHistoric').checked = state;
  document.getElementById('filterParks').checked = state;
  document.getElementById('filterParking').checked = state;
  document.getElementById('filterFuel').checked = state;
  document.getElementById('filterBanks').checked = state;
  document.getElementById('filterPostal').checked = state;
  document.getElementById('filterHotels').checked = state;
  document.getElementById('filterTourism').checked = state;
  document.getElementById('filterGameElementsAll').checked = state;
  document.getElementById('filterCheckpoints').checked = state;
  document.getElementById('filterDestination').checked = state;
  document.getElementById('filterCustomTrack').checked = state;
  document.getElementById('filterPolice').checked = state;
  document.getElementById('filterMemoryPins').checked = state;
  document.getElementById('filterMemoryFlowers').checked = state;
  document.getElementById('filterRoads').checked = state;
  appCtx.showRoads = state;
  document.getElementById('mapRoadsToggle').classList.toggle('active', state);
  const floatRoads = document.getElementById('fRoads');
  if (floatRoads) floatRoads.classList.toggle('on', state);
  updateMapLayers();
}

function toggleAllPOIs() {
  const state = document.getElementById('filterPOIsAll').checked;
  document.getElementById('filterSchools').checked = state;
  document.getElementById('filterHealthcare').checked = state;
  document.getElementById('filterEmergency').checked = state;
  document.getElementById('filterFood').checked = state;
  document.getElementById('filterShopping').checked = state;
  document.getElementById('filterCulture').checked = state;
  document.getElementById('filterHistoric').checked = state;
  document.getElementById('filterParks').checked = state;
  document.getElementById('filterParking').checked = state;
  document.getElementById('filterFuel').checked = state;
  document.getElementById('filterBanks').checked = state;
  document.getElementById('filterPostal').checked = state;
  document.getElementById('filterHotels').checked = state;
  document.getElementById('filterTourism').checked = state;
  updateMapLayers();
}

function toggleAllGameElements() {
  const state = document.getElementById('filterGameElementsAll').checked;
  document.getElementById('filterCheckpoints').checked = state;
  document.getElementById('filterDestination').checked = state;
  document.getElementById('filterCustomTrack').checked = state;
  updateMapLayers();
}

function toggleRoads() {
  appCtx.showRoads = document.getElementById('filterRoads').checked;
  appCtx.mapLayers.roads = appCtx.showRoads;
  document.getElementById('mapRoadsToggle').classList.toggle('active', appCtx.showRoads);
  const floatRoads = document.getElementById('fRoads');
  if (floatRoads) floatRoads.classList.toggle('on', appCtx.showRoads);
}

function closeMapInfo() {
  document.getElementById('mapInfoPanel').style.display = 'none';
}

function showMapInfo(type, data) {
  const panel = document.getElementById('mapInfoPanel');
  const title = document.getElementById('mapInfoTitle');
  const content = document.getElementById('mapInfoContent');

  panel.style.display = 'block';

  if (type === 'property') {
    title.textContent = '🏠 Property Details';
    const distance = Math.round(Math.sqrt((toFiniteNumber(data.x, 0) - appCtx.car.x) ** 2 + (toFiniteNumber(data.z, 0) - appCtx.car.z) ** 2));
    const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';
    const safeId = escapeJsString(data.id);
    const safeAddress = escapeHtml(data.address || 'Address unavailable');
    const safeCity = escapeHtml(data.city || '');
    const safeState = escapeHtml(data.state || '');
    const safeZipCode = escapeHtml(data.zipCode || '');
    const safePropertyType = escapeHtml(data.propertyType || 'Unknown');
    const safeBeds = toFiniteNumber(data.beds, 0);
    const safeBaths = toFiniteNumber(data.baths, 0);
    const safeSqft = toFiniteNumber(data.sqft, 0);
    const safeYearBuilt = escapeHtml(data.yearBuilt || 'N/A');
    const safePrice = toFiniteNumber(data.price, 0);

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${formatPrice(safePrice)}${data.priceType === 'rent' ? '/mo' : ''}</div>
        <div style="font-size:12px;opacity:0.9;margin-bottom:4px">${safeAddress}</div>
        <div style="font-size:11px;opacity:0.8">${safeCity}, ${safeState} ${safeZipCode}</div>
      </div>
      <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
        <div>🛏️ <strong>${safeBeds}</strong> beds</div>
        <div>🚿 <strong>${safeBaths}</strong> baths</div>
        <div>📐 <strong>${safeSqft}</strong> sqft</div>
        <div>📅 <strong>${safeYearBuilt}</strong></div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div>
        <div style="opacity:0.8">🏷️ Type: <strong>${safePropertyType}</strong></div>
      </div>
      <button onclick="navigateToProperty('${safeId}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
      <button onclick="openModalById('${safeId}'); closeMapInfo();" style="width:100%;background:rgba(0,255,200,0.2);color:#0fc;border:1px solid #0fc;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
    `;
  } else if (type === 'poi') {
    title.textContent = `${data.icon || '📍'} ${data.category || 'POI'}`;
    const safeX = toFiniteNumber(data.x, 0);
    const safeZ = toFiniteNumber(data.z, 0);
    const safeName = escapeHtml(data.name || 'Point of Interest');
    const safeCategory = escapeHtml(data.category || 'POI');
    const safeNameJs = escapeJsString(data.name || 'POI');
    const distance = Math.round(Math.sqrt((safeX - appCtx.car.x) ** 2 + (safeZ - appCtx.car.z) ** 2));
    const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${safeName}</div>
        <div style="font-size:11px;opacity:0.8">${safeCategory}</div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div>
      </div>
      <button onclick="navigateToPOI(${safeX}, ${safeZ}, '${safeNameJs}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px">🧭 NAVIGATE HERE</button>
    `;
  } else if (type === 'historic') {
    title.textContent = '⛩️ Historic Site';
    const safeName = escapeHtml(data.name || 'Historic Site');
    const safeCategory = escapeHtml(data.category || 'Historic');
    const safeNameJs = escapeJsString(data.name || 'Historic Site');
    const distance = Math.round(Math.sqrt((toFiniteNumber(data.x, 0) - appCtx.car.x) ** 2 + (toFiniteNumber(data.z, 0) - appCtx.car.z) ** 2));
    const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#f59e0b;margin-bottom:6px">${safeName}</div>
        <div style="font-size:11px;opacity:0.8">${safeCategory}</div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${escapeHtml(distanceText)}</strong></div>
      </div>
      <button onclick="navigateToHistoric('${safeNameJs}'); closeMapInfo();" style="width:100%;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
      <button onclick="openHistoricModal('${safeNameJs}'); closeMapInfo();" style="width:100%;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid #f59e0b;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
    `;
  }
}

function navigateToPOI(x, z) {
  appCtx.selectedProperty = null;
  appCtx.selectedHistoric = null;
  appCtx.showNavigation = true;

  createNavigationRoute(appCtx.car.x, appCtx.car.z, x, z);
  // Debug log removed
}

function openModalById(id) {
  const p = appCtx.properties.find((x) => x.id === id);
  if (!p || !appCtx.PropertyUI.modal) return;

  appCtx.PropertyUI.modalTitle.textContent = p.address || 'Property';

  const safeId = escapeJsString(p.id);
  const safePrice = toFiniteNumber(p.price, 0);
  const safeBeds = toFiniteNumber(p.beds, 0);
  const safeBaths = toFiniteNumber(p.baths, 0);
  const safeSqft = Math.round(toFiniteNumber(p.sqft, 0));
  const safePricePerSqft = toFiniteNumber(p.pricePerSqft, 0);
  const safePropertyType = escapeHtml(p.propertyType || 'Unknown');
  const safeYearBuilt = escapeHtml(p.yearBuilt || 'N/A');
  const safeDaysOnMarket = toFiniteNumber(p.daysOnMarket, 0);
  const safeSourceUrl = sanitizeHttpUrl(p.sourceUrl);
  const safePhotoUrls = Array.isArray(p.photos) ? p.photos.map(sanitizeHttpUrl).filter(Boolean).slice(0, 3) : [];
  const safePrimaryPhoto = sanitizeHttpUrl(p.primaryPhoto);

  const photos = safePhotoUrls.length > 0 ?
  safePhotoUrls.
  map((url) => `<img src="${escapeHtml(url)}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:100%;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'">`).
  join('') :
  safePrimaryPhoto ?
  `<img src="${escapeHtml(safePrimaryPhoto)}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:100%;border-radius:12px;margin-bottom:16px" onerror="this.style.display='none'">` :
  `<div style="width:100%;height:200px;background:#f1f5f9;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">🏠</div>`;

  // Source notice
  const sourceNotices = {
    demo: { bg: '#fef3c7', border: '#fbbf24', color: '#78350f', icon: '⚠️', title: 'Demo Property', text: 'Simulated data for demonstration. Configure API keys in Settings for real listings.' },
    estated: { bg: '#d1fae5', border: '#10b981', color: '#065f46', icon: '✓', title: 'Estated Data', text: 'Property data from Estated API - comprehensive property records.' },
    attom: { bg: '#ede9fe', border: '#8b5cf6', color: '#5b21b6', icon: '✓', title: 'ATTOM Data', text: 'Premium property data from ATTOM Data Solutions.' },
    rentcast: { bg: '#dbeafe', border: '#3b82f6', color: '#1e3a8a', icon: '✓', title: 'RentCast Listing', text: 'Live property listing from RentCast API.' }
  };

  const notice = sourceNotices[p.source] || sourceNotices.demo;
  const sourceNotice = `<div style="background:${notice.bg};border:2px solid ${notice.border};border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:${notice.color}">
        <strong>${notice.icon} ${notice.title}</strong><br>
        ${notice.text}
       </div>`;

  const isSelected = appCtx.selectedProperty && appCtx.selectedProperty.id === p.id;
  const navButtons = `
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="navigateToProperty('${safeId}')" style="flex:1;background:${isSelected ? '#10b981' : '#667eea'};border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Navigate Here'}
      </button>
      ${isSelected ? `<button onclick="clearNavigation()" style="flex:1;background:#ef4444;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">✕ Clear Route</button>` : ''}
    </div>
  `;

  appCtx.PropertyUI.modalBody.innerHTML = `
    ${sourceNotice}
    ${photos}
    <div class="prop-stat">
      <span class="prop-stat-label">Price</span>
      <span class="prop-stat-value">${formatPrice(safePrice)}${p.priceType === 'rent' ? '/mo' : ''}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Bedrooms</span>
      <span class="prop-stat-value">${safeBeds}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Bathrooms</span>
      <span class="prop-stat-value">${safeBaths}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Square Feet</span>
      <span class="prop-stat-value">${safeSqft.toLocaleString()}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Price per sqft</span>
      <span class="prop-stat-value">${formatPrice(safePricePerSqft)}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Property Type</span>
      <span class="prop-stat-value">${safePropertyType}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Year Built</span>
      <span class="prop-stat-value">${safeYearBuilt}</span>
    </div>
    ${safeDaysOnMarket > 0 ? `<div class="prop-stat">
      <span class="prop-stat-label">Days on Market</span>
      <span class="prop-stat-value">${safeDaysOnMarket}</span>
    </div>` : ''}
    ${navButtons}
    ${safeSourceUrl ? `<button onclick="window.open('${escapeJsString(safeSourceUrl)}','_blank','noopener,noreferrer')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">🔗 View Full Listing</button>` : ''}
  `;
  appCtx.PropertyUI.modal.classList.add('show');
}

function closeModal() {
  if (appCtx.PropertyUI.modal) appCtx.PropertyUI.modal.classList.remove('show');
}

function closePropertyPanel() {
  if (appCtx.PropertyUI.panel) appCtx.PropertyUI.panel.classList.remove('show');
}

function toggleRealEstate() {
  appCtx.realEstateMode = !appCtx.realEstateMode;
  if (appCtx.PropertyUI.button) appCtx.PropertyUI.button.classList.toggle('active', appCtx.realEstateMode);

  if (appCtx.realEstateMode) {
    loadPropertiesAtCurrentLocation();
  } else {
    closePropertyPanel();
    clearPropertyMarkers();
  }
}

async function loadPropertiesAtCurrentLocation() {
  const lat = appCtx.LOC.lat - appCtx.car.z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + appCtx.car.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));

  // Check if we have any API keys configured
  const hasRealAPI = appCtx.apiConfig.estated || appCtx.apiConfig.attom || appCtx.apiConfig.rentcast;
  const message = hasRealAPI ? 'Fetching real data...' : 'Fetching demo data...';

  appCtx.showLoad(message);
  appCtx.properties = (await appCtx.PropertyAPI.fetchProperties(lat, lon, 1)) || [];
  appCtx.hideLoad();

  if (appCtx.properties.length > 0) {
    updatePropertyPanel();
    renderPropertyMarkers();
  } else {
    console.warn('No properties loaded');
  }
}

function renderPropertyMarkers() {
  clearPropertyMarkers();

  appCtx.properties.forEach((prop) => {
    const pos = appCtx.geoToWorld(prop.lat, prop.lon);

    // Create 3D marker for property
    const height = Math.log10(prop.price) * 2; // Height based on price
    const geometry = new THREE.CylinderGeometry(2, 2, height, 8);
    const color = prop.priceType === 'sale' ? 0x10b981 : 0x3b82f6;
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, height / 2, pos.z);
    mesh.castShadow = true;
    appCtx.scene.add(mesh);
    appCtx.propMarkers.push(mesh);

    // Add price label on top
    const labelGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 0.5
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(pos.x, height + 1.5, pos.z);
    appCtx.scene.add(label);
    appCtx.propMarkers.push(label);

    // Add photo billboard if property has image
    if (prop.primaryPhoto) {
      // Create canvas to handle CORS issues with external images
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = function () {
        try {
          // Create canvas with image
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Create texture from canvas
          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;

          // Create billboard
          const billboardHeight = 10;
          const aspectRatio = img.width / img.height;
          const billboardWidth = billboardHeight * aspectRatio;

          const billboardGeo = new THREE.PlaneGeometry(billboardWidth, billboardHeight);
          const billboardMat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: false
          });

          const billboard = new THREE.Mesh(billboardGeo, billboardMat);
          billboard.position.set(pos.x, height + 8, pos.z);

          // Store billboard data for camera-facing update
          billboard.userData.isBillboard = true;
          billboard.userData.propertyId = prop.id;

          appCtx.scene.add(billboard);
          appCtx.propMarkers.push(billboard);
        } catch (e) {
          console.warn('Canvas rendering failed for:', prop.primaryPhoto, e);
        }
      };

      img.onerror = function () {
        // Fallback: try direct texture loading
        const loader = new THREE.TextureLoader();
        loader.crossOrigin = 'anonymous';

        loader.load(
          prop.primaryPhoto,
          function (texture) {
            const billboardHeight = 10;
            const aspectRatio = texture.image.width / texture.image.height;
            const billboardWidth = billboardHeight * aspectRatio;

            const billboardGeo = new THREE.PlaneGeometry(billboardWidth, billboardHeight);
            const billboardMat = new THREE.MeshBasicMaterial({
              map: texture,
              side: THREE.DoubleSide
            });

            const billboard = new THREE.Mesh(billboardGeo, billboardMat);
            billboard.position.set(pos.x, height + 8, pos.z);
            billboard.userData.isBillboard = true;
            billboard.userData.propertyId = prop.id;

            appCtx.scene.add(billboard);
            appCtx.propMarkers.push(billboard);
          },
          undefined,
          function () {
            console.warn('Failed to load property image:', prop.primaryPhoto);
          }
        );
      };

      img.src = prop.primaryPhoto;
    }
  });
}

function clearPropertyMarkers() {
  appCtx.propMarkers.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.propMarkers = [];
}

// ==================== HISTORIC SITES SYSTEM ====================

function toggleHistoric() {
  appCtx.historicMode = !appCtx.historicMode;
  const btn = document.getElementById('historicBtn');
  if (btn) btn.classList.toggle('active', appCtx.historicMode);

  if (appCtx.historicMode) {
    updateHistoricPanel();
  } else {
    closeHistoricPanel();
  }
}

function updateHistoricPanel() {
  const list = document.getElementById('historicList');
  if (!list) return;

  // Only show if historic mode is active
  if (!appCtx.historicMode) return;

  // Calculate distances
  appCtx.historicSites.forEach((site) => {
    const dx = site.x - appCtx.car.x;
    const dz = site.z - appCtx.car.z;
    site.distance = Math.sqrt(dx * dx + dz * dz);
  });

  // Sort by distance
  appCtx.historicSites.sort((a, b) => a.distance - b.distance);

  // Update count
  document.getElementById('historicCount').textContent = `${appCtx.historicSites.length} Sites`;

  // Create cards
  list.innerHTML = appCtx.historicSites.map(createHistoricCard).join('');
  document.getElementById('historicPanel').classList.add('show');
}

function createHistoricCard(site) {
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

async function openHistoricModal(siteName) {
  const site = appCtx.historicSites.find((s) => s.name === siteName);
  if (!site || !appCtx.PropertyUI.modal) return;

  appCtx.PropertyUI.modalTitle.textContent = site.name || 'Historic Site';
  const safeNameJs = escapeJsString(site.name || 'Historic Site');
  const safeCategory = escapeHtml(site.category || 'Historic');
  const safeIcon = escapeHtml(site.icon || '⛩️');
  const safeLat = toFiniteNumber(site.lat, 0).toFixed(4);
  const safeLon = toFiniteNumber(site.lon, 0).toFixed(4);

  let fact = 'Historic site with cultural significance.';

  // Try to get Wikipedia info if available
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
  const safeFact = escapeHtml(fact);
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
      ${safeFact}
    </div>
    <div style="width:100%;height:200px;background:#f5f5f5;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">
      ${safeIcon}
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Type</span>
      <span class="prop-stat-value">${safeCategory}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Distance</span>
      <span class="prop-stat-value">${escapeHtml(distanceText)}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Location</span>
      <span class="prop-stat-value">${safeLat}, ${safeLon}</span>
    </div>
    ${navButtons}
    ${wikiUrl ? `<button onclick="window.open('${escapeJsString(wikiUrl)}','_blank','noopener,noreferrer')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">📖 Wikipedia</button>` : ''}
  `;
  appCtx.PropertyUI.modal.classList.add('show');
}

function navigateToHistoric(siteName) {
  const site = appCtx.historicSites.find((s) => s.name === siteName);
  if (!site) return;

  appCtx.selectedHistoric = site;
  appCtx.selectedProperty = null; // Clear property navigation
  appCtx.showNavigation = true;

  createNavigationRoute(appCtx.car.x, appCtx.car.z, site.x, site.z);
  updateHistoricPanel();
  closeModal();

  // Debug log removed
}

function closeHistoricPanel() {
  document.getElementById('historicPanel').classList.remove('show');
}

// Navigation system
function navigateToProperty(propertyId) {
  const prop = appCtx.properties.find((p) => p.id === propertyId);
  if (!prop) return;

  appCtx.selectedProperty = prop;
  appCtx.showNavigation = true;

  // Create navigation route - simple straight line for now
  createNavigationRoute(appCtx.car.x, appCtx.car.z, prop.x, prop.z);

  // Update UI
  updatePropertyPanel();
  closeModal();

  // Debug log removed
}

function clearNavigation() {
  appCtx.selectedProperty = null;
  appCtx.selectedHistoric = null;
  appCtx.showNavigation = false;

  if (appCtx.navigationRoute) {
    appCtx.scene.remove(appCtx.navigationRoute);
    appCtx.navigationRoute = null;
  }

  if (appCtx.navigationMarker) {
    appCtx.scene.remove(appCtx.navigationMarker);
    appCtx.navigationMarker = null;
  }

  // Hide navigation HUD
  document.getElementById('navigationHud').style.display = 'none';

  updatePropertyPanel();
  if (appCtx.historicMode) updateHistoricPanel();
  closeModal();
}

function createNavigationRoute(fromX, fromZ, toX, toZ) {
  // Remove old route and marker
  if (appCtx.navigationRoute) {
    appCtx.scene.remove(appCtx.navigationRoute);
  }
  if (appCtx.navigationMarker) {
    appCtx.scene.remove(appCtx.navigationMarker);
  }

  // Create glowing line from current position to destination
  const points = [];
  const numPoints = 50; // Smooth curve

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = fromX + (toX - fromX) * t;
    const z = fromZ + (toZ - fromZ) * t;

    // Add some height for visibility
    const height = Math.sin(t * Math.PI) * 5 + 2;

    points.push(new THREE.Vector3(x, height, z));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeometry = new THREE.TubeGeometry(curve, 50, 0.3, 8, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.8
  });

  appCtx.navigationRoute = new THREE.Mesh(tubeGeometry, tubeMaterial);
  appCtx.scene.add(appCtx.navigationRoute);

  // Create destination marker - a glowing beacon
  const markerGroup = new THREE.Group();

  // Pulsing sphere
  const sphereGeometry = new THREE.SphereGeometry(2, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.7
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.y = 5;
  markerGroup.add(sphere);

  // Vertical beam
  const beamGeometry = new THREE.CylinderGeometry(0.2, 0.2, 20, 8);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.5
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.y = 10;
  markerGroup.add(beam);

  markerGroup.position.set(toX, 0, toZ);
  appCtx.navigationMarker = markerGroup;
  appCtx.scene.add(appCtx.navigationMarker);

  // Animate marker (pulsing effect)
  const animateMarker = () => {
    if (appCtx.navigationMarker && appCtx.navigationMarker.parent) {
      const time = Date.now() * 0.003;
      sphere.scale.setScalar(1 + Math.sin(time) * 0.2);
      sphere.material.opacity = 0.5 + Math.sin(time) * 0.2;
      requestAnimationFrame(animateMarker);
    }
  };
  animateMarker();
}

function updateNavigationRoute() {
  const navHud = document.getElementById('navigationHud');

  if (appCtx.showNavigation) {
    const destination = appCtx.selectedProperty || appCtx.selectedHistoric;
    if (destination) {
      // Get current position based on active mode
      let currentX, currentZ, currentAngle;

      if (appCtx.droneMode) {
        // Drone mode
        currentX = appCtx.drone.x;
        currentZ = appCtx.drone.z;
        currentAngle = appCtx.drone.yaw;
      } else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
        // Walking mode
        currentX = appCtx.Walk.state.walker.x;
        currentZ = appCtx.Walk.state.walker.z;
        currentAngle = appCtx.Walk.state.walker.yaw;
      } else {
        // Driving mode
        currentX = appCtx.car.x;
        currentZ = appCtx.car.z;
        currentAngle = appCtx.car.angle;
      }

      createNavigationRoute(currentX, currentZ, destination.x, destination.z);

      // Calculate distance and direction
      const dx = destination.x - currentX;
      const dz = destination.z - currentZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Calculate angle to destination
      const angleToDestination = Math.atan2(dx, dz);
      const relativeAngle = angleToDestination - currentAngle;

      // Normalize angle to -PI to PI
      let normalizedAngle = relativeAngle;
      while (normalizedAngle > Math.PI) normalizedAngle -= 2 * Math.PI;
      while (normalizedAngle < -Math.PI) normalizedAngle += 2 * Math.PI;

      // Convert to degrees for arrow rotation
      const arrowRotation = -normalizedAngle * (180 / Math.PI);

      // Update HUD
      navHud.style.display = 'block';
      document.getElementById('navDestination').textContent =
      appCtx.selectedProperty ? appCtx.selectedProperty.address.substring(0, 30) : appCtx.selectedHistoric.name.substring(0, 30);

      // Format distance
      if (dist < 1000) {
        document.getElementById('navDistance').textContent = Math.floor(dist) + 'm';
      } else {
        document.getElementById('navDistance').textContent = (dist / 1000).toFixed(1) + 'km';
      }

      // Update direction arrow
      document.getElementById('navDirection').style.transform = `rotate(${arrowRotation}deg)`;

      // Check if arrived (within 10 meters)
      if (dist < 10) {
        // Debug log removed
        document.getElementById('navDistance').textContent = '✓ Arrived!';
        // Optionally auto-clear navigation on arrival after a delay
        // setTimeout(() => clearNavigation(), 2000);
      }
    }
  } else {
    // Hide navigation HUD when not navigating
    navHud.style.display = 'none';
  }
}

function updatePolice(dt) {
  if (!appCtx.policeOn || appCtx.police.length === 0) return;
  const mph = Math.abs(appCtx.car.speed * 0.5);
  const limit = appCtx.car.road?.limit || 25;
  const speeding = mph > limit;
  appCtx.police.forEach((cop) => {
    cop.siren += dt * 10;
    if (cop.cooldown > 0) cop.cooldown -= dt;
    const dx = appCtx.car.x - cop.x,dz = appCtx.car.z - cop.z,dist = Math.hypot(dx, dz);

    // Start chasing if speeding and within range
    if (speeding && dist < appCtx.CFG.policeDist) cop.chasing = true;

    // REMOVED: Don't stop chasing when below speed limit - they keep chasing once started!
    // Only stop chasing if very far away (gave up the chase)
    if (dist > appCtx.CFG.policeDist * 1.5) cop.chasing = false;

    if (cop.chasing) {
      const ta = Math.atan2(dx, dz);
      let ad = ta - cop.angle;
      while (ad > Math.PI) ad -= Math.PI * 2;
      while (ad < -Math.PI) ad += Math.PI * 2;
      cop.angle += ad * 4 * dt;
      if (dist > 50) cop.speed += appCtx.CFG.policeAccel * dt;else
      cop.speed *= 0.95;
      cop.speed = Math.min(cop.speed, appCtx.CFG.policeSpd);
      cop.mesh.children[2].material.color.setHex(Math.sin(cop.siren) > 0 ? 0xff0000 : 0x440000);
      cop.mesh.children[3].material.color.setHex(Math.sin(cop.siren) > 0 ? 0x000044 : 0x0066ff);
    } else cop.speed *= 0.98;

    // FIXED: Police can move through buildings when chasing
    let cnx = cop.x + Math.sin(cop.angle) * cop.speed * dt;
    let cnz = cop.z + Math.cos(cop.angle) * cop.speed * dt;

    // When chasing, police can go anywhere (through buildings)
    if (cop.chasing) {
      cop.x = cnx;
      cop.z = cnz;
    } else {
      // When not chasing, try to stay on road
      const nr = appCtx.findNearestRoad(cnx, cnz);
      if (nr.dist < 50) {
        cop.x = cnx;
        cop.z = cnz;
      } else if (nr.pt) {
        cop.x = nr.pt.x;
        cop.z = nr.pt.z;
      }
    }

    // Find surface below police
    let policeY = 0;

    if (appCtx.terrainEnabled) {
      let baseY = appCtx.elevationWorldYAtWorldXZ(cop.x, cop.z);

      // Check if near road
      const nearRoad = appCtx.findNearestRoad(cop.x, cop.z);

      if (nearRoad.dist < 20 && appCtx.roadMeshes.length > 0) {
        // Near road - raycast against roads
        const raycaster = appCtx._getPhysRaycaster();
        appCtx._physRayStart.set(cop.x, 200, cop.z);
        raycaster.set(appCtx._physRayStart, appCtx._physRayDir);

        const roadHits = raycaster.intersectObjects(appCtx.roadMeshes, false);

        if (roadHits.length > 0) {
          policeY = roadHits[0].point.y;
        } else {
          policeY = baseY;
        }
      } else {
        // Off-road - use terrain
        policeY = baseY;
      }
    }

    cop.mesh.position.set(cop.x, policeY, cop.z);
    cop.mesh.rotation.y = cop.angle;

    // Collision with player
    if (dist < 4 && cop.chasing && cop.cooldown <= 0) {
      appCtx.policeHits++;
      cop.cooldown = 2;
      appCtx.car.speed *= 0.3;
      cop.speed = 0;
      document.getElementById('police').textContent = '💔 ' + appCtx.policeHits + '/3';
      if (appCtx.policeHits >= 3) {appCtx.paused = true;document.getElementById('caughtScreen').classList.add('show');}
    }
  });
}

function spawnPolice() {
  appCtx.policeMeshes.forEach((m) => appCtx.scene.remove(m));appCtx.policeMeshes = [];appCtx.police = [];appCtx.policeHits = 0;
  document.getElementById('police').textContent = '💔 0/3';
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.8 }));
    body.position.y = 0.5;body.castShadow = true;mesh.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.9 }));
    hood.position.set(0, 0.8, 0.7);mesh.add(hood);
    const sr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 })); // Reduced from 3
    sr.position.set(-0.3, 0.92, 0);mesh.add(sr);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x0066ff, emissive: 0x0066ff, emissiveIntensity: 1.5 })); // Reduced from 3
    sb.position.set(0.3, 0.92, 0);mesh.add(sb);
    const ang = appCtx.car.angle + Math.PI + (i === 0 ? 0.4 : -0.4);
    const dist = 50 + i * 20;
    const spawnX = appCtx.car.x + Math.sin(ang) * dist;
    const spawnZ = appCtx.car.z + Math.cos(ang) * dist;

    // Find surface at spawn position (should be on road since spawning behind player)
    let spawnY = 0;
    if (appCtx.terrainEnabled && appCtx.roadMeshes.length > 0) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(spawnX, 200, spawnZ);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);

      const roadHits = raycaster.intersectObjects(appCtx.roadMeshes, false);

      if (roadHits.length > 0) {
        spawnY = roadHits[0].point.y;
      } else {
        // Fallback to terrain
        spawnY = appCtx.elevationWorldYAtWorldXZ(spawnX, spawnZ);
      }
    }

    mesh.position.set(spawnX, spawnY, spawnZ);
    appCtx.scene.add(mesh);appCtx.policeMeshes.push(mesh);
    appCtx.police.push({ mesh, x: spawnX, z: spawnZ, angle: appCtx.car.angle, speed: 0, siren: i * Math.PI, chasing: false, cooldown: 0 });
  }
}

function clearPolice() {
  appCtx.policeMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.policeMeshes = [];
  appCtx.police = [];
}

const PAINT_TOWN_DURATION_SEC = 120;
const PAINT_TOWN_MIN_DURATION_SEC = 30;
const PAINT_TOWN_MAX_DURATION_SEC = 1800;
const PAINTBALL_SPEED_MPS = 42;
const PAINTBALL_GRAVITY_MPS2 = 22;
const PAINTBALL_RADIUS_M = 0.22;
const PAINTBALL_LIFETIME_SEC = 4.5;
const PAINTBALL_SHOT_COOLDOWN_MS = 180;
const PAINTBALL_MAX_ACTIVE = 24;
const PAINT_SPLAT_LIFETIME_SEC = 3.5;
const PAINT_SPLAT_MAX_ACTIVE = 96;
const PAINT_SPLAT_RADIUS_M = 0.42;
const PAINT_TOWN_TOUCH_MODES = new Set(['off', 'roof', 'any']);
const PAINT_TOWN_METHODS = new Set(['roof', 'touch-roof', 'touch-any', 'gun']);
const PAINT_TOWN_COLORS = Object.freeze([
  { name: 'Red', hex: '#D61F2C' },
  { name: 'Blue', hex: '#1D4ED8' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Purple', hex: '#9333EA' },
  { name: 'Orange', hex: '#EA580C' }
]);
const PAINT_TOWN_DEFAULT_COLOR = PAINT_TOWN_COLORS[0];
const PAINT_TOWN_DEFAULT_RULES = Object.freeze({
  paintTimeLimitSec: PAINT_TOWN_DURATION_SEC,
  paintTouchMode: 'any',
  allowPaintballGun: true,
  allowRoofAutoPaint: true
});

function normalizePaintTouchMode(raw) {
  const mode = String(raw || '').toLowerCase();
  return PAINT_TOWN_TOUCH_MODES.has(mode) ? mode : PAINT_TOWN_DEFAULT_RULES.paintTouchMode;
}

function normalizePaintDurationSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return PAINT_TOWN_DEFAULT_RULES.paintTimeLimitSec;
  return Math.max(PAINT_TOWN_MIN_DURATION_SEC, Math.min(PAINT_TOWN_MAX_DURATION_SEC, Math.floor(parsed)));
}

function normalizePaintTownRules(rawRules = {}) {
  const source = rawRules && typeof rawRules === 'object' ? rawRules : {};
  return {
    paintTimeLimitSec: normalizePaintDurationSec(source.paintTimeLimitSec),
    paintTouchMode: normalizePaintTouchMode(source.paintTouchMode),
    allowPaintballGun: source.allowPaintballGun !== false,
    allowRoofAutoPaint: source.allowRoofAutoPaint !== false
  };
}

function normalizePaintColorHex(rawHex, fallback = PAINT_TOWN_DEFAULT_COLOR.hex) {
  const text = String(rawHex || '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(text)) return text;
  return String(fallback || PAINT_TOWN_DEFAULT_COLOR.hex).trim().toUpperCase();
}

function paintColorNameFromHex(colorHex) {
  const normalized = normalizePaintColorHex(colorHex);
  const found = PAINT_TOWN_COLORS.find((entry) => entry.hex.toUpperCase() === normalized);
  return found ? found.name : 'Custom';
}

function paintColorHexToInt(colorHex) {
  const normalized = normalizePaintColorHex(colorHex).slice(1);
  return Number.parseInt(normalized, 16);
}

function normalizePaintMethod(rawMethod) {
  const method = String(rawMethod || '').toLowerCase();
  return PAINT_TOWN_METHODS.has(method) ? method : 'touch-any';
}

function getPaintTownPlayerUid() {
  const authUid = String(globalThis.__WE3D_AUTH_UID__ || '').trim();
  return authUid || 'local-player';
}

function getPreferredPaintTownColor(uid = '') {
  const userKey = String(uid || getPaintTownPlayerUid()).trim();
  if (!userKey) return PAINT_TOWN_DEFAULT_COLOR.hex;
  try {
    const stored = localStorage.getItem(`worldExplorer3D.paintTown.color.${userKey}`);
    return normalizePaintColorHex(stored, PAINT_TOWN_DEFAULT_COLOR.hex);
  } catch (_) {
    return PAINT_TOWN_DEFAULT_COLOR.hex;
  }
}

function setPreferredPaintTownColor(colorHex, uid = '') {
  const normalized = normalizePaintColorHex(colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const userKey = String(uid || getPaintTownPlayerUid()).trim();
  if (!userKey) return normalized;
  try {
    localStorage.setItem(`worldExplorer3D.paintTown.color.${userKey}`, normalized);
  } catch (_) {
    // Ignore storage failures.
  }
  return normalized;
}

function ensurePaintTownState() {
  if (!appCtx.paintTown) {
    appCtx.paintTown = {
      active: false,
      totalBuildings: 0,
      paintedBuildings: 0,
      paintedKeys: new Set(),
      timerSec: PAINT_TOWN_DURATION_SEC,
      lastHint: '',
      autoPaintTickSec: 0,
      scoreSubmitted: false,
      colorCounts: {},
      claimsByKey: new Map(),
      buildingByKey: new Map(),
      sourceIdToKey: new Map(),
      footprintToKey: new Map(),
      playerColorHex: getPreferredPaintTownColor(),
      activeTool: 'gun',
      rules: normalizePaintTownRules(),
      paintballs: [],
      paintSplats: [],
      inputBound: false,
      multiplayerRoomId: '',
      multiplayerUid: '',
      roomSeed: null,
      remoteSyncRevision: 0,
      lastShotAtMs: 0,
      ctrlFireLatched: false,
      hudBound: false,
      hudExpanded: false,
      hudRenderSig: '',
      latestRemoteClaims: []
    };
  }
  if (!(appCtx.paintTown.paintedKeys instanceof Set)) {
    appCtx.paintTown.paintedKeys = new Set();
  }
  if (!(appCtx.paintTown.claimsByKey instanceof Map)) {
    appCtx.paintTown.claimsByKey = new Map();
  }
  if (!(appCtx.paintTown.buildingByKey instanceof Map)) {
    appCtx.paintTown.buildingByKey = new Map();
  }
  if (!(appCtx.paintTown.sourceIdToKey instanceof Map)) {
    appCtx.paintTown.sourceIdToKey = new Map();
  }
  if (!(appCtx.paintTown.footprintToKey instanceof Map)) {
    appCtx.paintTown.footprintToKey = new Map();
  }
  if (!Array.isArray(appCtx.paintTown.paintballs)) {
    appCtx.paintTown.paintballs = [];
  }
  if (!Array.isArray(appCtx.paintTown.paintSplats)) {
    appCtx.paintTown.paintSplats = [];
  }
  if (!Array.isArray(appCtx.paintTown.latestRemoteClaims)) {
    appCtx.paintTown.latestRemoteClaims = [];
  }
  if (!appCtx.paintTown.rules || typeof appCtx.paintTown.rules !== 'object') {
    appCtx.paintTown.rules = normalizePaintTownRules();
  } else {
    appCtx.paintTown.rules = normalizePaintTownRules(appCtx.paintTown.rules);
  }
  appCtx.paintTown.playerColorHex = normalizePaintColorHex(
    appCtx.paintTown.playerColorHex,
    getPreferredPaintTownColor()
  );
  appCtx.paintTown.activeTool = String(appCtx.paintTown.activeTool || '').toLowerCase() === 'touch' ? 'touch' : 'gun';
  appCtx.paintTown.ctrlFireLatched = appCtx.paintTown.ctrlFireLatched === true;
  appCtx.paintTown.hudExpanded = appCtx.paintTown.hudExpanded === true;
  appCtx.paintTown.hudRenderSig = String(appCtx.paintTown.hudRenderSig || '');
  return appCtx.paintTown;
}

function ensurePaintTownHud() {
  let hud = document.getElementById('paintTownHud');
  if (hud) return hud;

  hud = document.createElement('div');
  hud.id = 'paintTownHud';
  hud.style.position = 'fixed';
  hud.style.top = '20px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '90';
  hud.style.minWidth = '220px';
  hud.style.maxWidth = '88vw';
  hud.style.padding = '8px 10px';
  hud.style.borderRadius = '12px';
  hud.style.border = '1px solid rgba(220, 38, 38, 0.45)';
  hud.style.background = 'rgba(10, 15, 28, 0.86)';
  hud.style.backdropFilter = 'blur(6px)';
  hud.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.35)';
  hud.style.color = '#f8fafc';
  hud.style.fontFamily = "'Poppins', sans-serif";
  hud.style.fontSize = '11px';
  hud.style.lineHeight = '1.35';
  hud.style.display = 'none';
  hud.style.pointerEvents = 'auto';
  document.body.appendChild(hud);
  return hud;
}

function getPaintTownActorState() {
  if (appCtx.droneMode && appCtx.drone) {
    return { x: appCtx.drone.x, z: appCtx.drone.z, feetY: appCtx.drone.y, mode: 'drone' };
  }

  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker) {
    const walker = appCtx.Walk.state.walker;
    const eyeHeight = appCtx.Walk?.CFG?.eyeHeight || 1.7;
    return { x: walker.x, z: walker.z, feetY: walker.y - eyeHeight, mode: 'walking' };
  }

  if (appCtx.car) {
    return { x: appCtx.car.x, z: appCtx.car.z, feetY: appCtx.car.y, mode: 'driving' };
  }

  return null;
}

function getBuildingKey(building, index = 0) {
  if (!building) return `building-${index}`;
  if (building.sourceBuildingId) return String(building.sourceBuildingId);
  if (building._paintTownKey) return building._paintTownKey;
  const cx = Number.isFinite(building.centerX) ? Math.round(building.centerX * 10) : index;
  const cz = Number.isFinite(building.centerZ) ? Math.round(building.centerZ * 10) : index;
  const h = Number.isFinite(building.height) ? Math.round(building.height * 10) : 0;
  building._paintTownKey = `building-${cx}-${cz}-${h}-${index}`;
  return building._paintTownKey;
}

function footprintSignature(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return '';
  return pts.map((pt) => `${Math.round(Number(pt.x || 0) * 10)},${Math.round(Number(pt.z || 0) * 10)}`).join(';');
}

function buildPaintTownBuildingIndex() {
  const state = ensurePaintTownState();
  state.buildingByKey.clear();
  state.sourceIdToKey.clear();
  state.footprintToKey.clear();

  const buildings = Array.isArray(appCtx.buildings) ? appCtx.buildings : [];
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building) continue;
    const key = getBuildingKey(building, i);
    state.buildingByKey.set(key, building);
    if (building.sourceBuildingId) {
      state.sourceIdToKey.set(String(building.sourceBuildingId), key);
    }
    const signature = footprintSignature(building.pts);
    if (signature) {
      state.footprintToKey.set(signature, key);
    }
  }
}

function buildingContainsPoint(building, x, z) {
  if (!building) return false;
  if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
  if (Array.isArray(building.pts) && building.pts.length >= 3 && typeof appCtx.pointInPolygon === 'function') {
    if (appCtx.pointInPolygon(x, z, building.pts)) return true;
    // Fallback to bbox acceptance for complex/concave OSM rings where centroid sampling is imperfect.
    return true;
  }
  return true;
}

function getBuildingRoofY(building, x, z) {
  let baseY = Number.isFinite(building?.baseY) ? building.baseY : NaN;
  if (!Number.isFinite(baseY) && typeof appCtx.terrainMeshHeightAt === 'function') {
    baseY = appCtx.terrainMeshHeightAt(x, z);
  }
  if (!Number.isFinite(baseY) && typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
    baseY = appCtx.elevationWorldYAtWorldXZ(x, z);
  }
  if (!Number.isFinite(baseY) && Number.isFinite(building?.minY)) {
    baseY = building.minY;
  }
  if (!Number.isFinite(baseY)) baseY = 0;
  return baseY + (Number.isFinite(building?.height) ? building.height : 0);
}

function footprintsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 0.05 || Math.abs(a[i].z - b[i].z) > 0.05) {
      return false;
    }
  }
  return true;
}

function findPaintableRoofBuilding(actor) {
  const mode = actor?.mode === 'drone' ? 'drone' : 'ground';
  const preferredMin = mode === 'drone' ? -2.5 : -1.5;
  const preferredMax = mode === 'drone' ? 9.5 : 4.0;
  const fallbackAbsDelta = mode === 'drone' ? 14 : 6;

  function pickCandidate(best, candidate) {
    if (!best) return candidate;
    if (candidate.absDelta < best.absDelta - 0.02) return candidate;
    if (Math.abs(candidate.absDelta - best.absDelta) <= 0.02 && candidate.roofY > best.roofY) return candidate;
    return best;
  }

  function scanCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    let bestPreferred = null;
    let bestFallback = null;

    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i];
      if (!buildingContainsPoint(building, actor.x, actor.z)) continue;
      const roofY = getBuildingRoofY(building, actor.x, actor.z);
      const verticalDelta = actor.feetY - roofY;
      if (!Number.isFinite(verticalDelta)) continue;
      const absDelta = Math.abs(verticalDelta);
      const candidate = { building, roofY, key: getBuildingKey(building, i), absDelta };

      if (verticalDelta >= preferredMin && verticalDelta <= preferredMax) {
        bestPreferred = pickCandidate(bestPreferred, candidate);
        continue;
      }
      if (absDelta <= fallbackAbsDelta) {
        bestFallback = pickCandidate(bestFallback, candidate);
      }
    }

    return bestPreferred || bestFallback;
  }

  const nearby = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(actor.x, actor.z, 14) :
  appCtx.buildings;

  const nearbyHit = scanCandidates(nearby);
  if (nearbyHit) return nearbyHit;

  if (nearby !== appCtx.buildings) {
    return scanCandidates(appCtx.buildings);
  }
  return null;
}

function getBuildingMeshesForKey(key, building = null) {
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return [];
  const out = [];
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh || mesh.userData?.isBuildingBatch) continue;
    const meshKey = mesh.userData?.sourceBuildingId ? String(mesh.userData.sourceBuildingId) : null;
    if (meshKey && meshKey === key) {
      out.push(mesh);
      continue;
    }
    if (!building || !Array.isArray(building.pts)) continue;
    const footprint = mesh.userData?.buildingFootprint;
    if (!Array.isArray(footprint) || footprint.length === 0) continue;
    if (footprint === building.pts || footprintsMatch(footprint, building.pts)) {
      out.push(mesh);
    }
  }
  return out;
}

function resolveBuildingKeyFromMesh(meshLike, fallbackPoint = null) {
  const state = ensurePaintTownState();
  let cursor = meshLike || null;
  while (cursor) {
    const sourceId = cursor.userData?.sourceBuildingId;
    if (sourceId && state.sourceIdToKey.has(String(sourceId))) {
      return state.sourceIdToKey.get(String(sourceId));
    }
    const signature = footprintSignature(cursor.userData?.buildingFootprint);
    if (signature && state.footprintToKey.has(signature)) {
      return state.footprintToKey.get(signature);
    }
    cursor = cursor.parent || null;
  }

  if (fallbackPoint && Number.isFinite(fallbackPoint.x) && Number.isFinite(fallbackPoint.z)) {
    const nearby = typeof appCtx.getNearbyBuildings === 'function'
      ? appCtx.getNearbyBuildings(fallbackPoint.x, fallbackPoint.z, 22) || []
      : (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);
    for (let i = 0; i < nearby.length; i++) {
      const b = nearby[i];
      if (!buildingContainsPoint(b, fallbackPoint.x, fallbackPoint.z)) continue;
      return getBuildingKey(b, i);
    }
  }

  return '';
}

function createPaintTownMaterial(baseMaterial, colorHex) {
  const mat = baseMaterial?.isMaterial ?
  baseMaterial.clone() :
  new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.08 });

  const paintColorInt = paintColorHexToInt(colorHex);
  if (mat.color && typeof mat.color.setHex === 'function') {
    mat.color.setHex(paintColorInt);
  }
  if ('map' in mat) mat.map = null;
  if ('normalMap' in mat) mat.normalMap = null;
  if ('roughnessMap' in mat) mat.roughnessMap = null;
  if ('metalnessMap' in mat) mat.metalnessMap = null;
  if ('aoMap' in mat) mat.aoMap = null;
  if ('bumpMap' in mat) mat.bumpMap = null;
  if ('emissive' in mat && mat.emissive && typeof mat.emissive.setHex === 'function') {
    mat.emissive.setHex(0x220000);
    mat.emissiveIntensity = 0.24;
  }
  if ('roughness' in mat && Number.isFinite(mat.roughness)) mat.roughness = Math.max(0.62, mat.roughness);
  if ('metalness' in mat && Number.isFinite(mat.metalness)) mat.metalness = Math.min(0.2, mat.metalness);
  mat.needsUpdate = true;
  return mat;
}

function disposePaintTownMaterials(paintMaterials) {
  if (Array.isArray(paintMaterials)) {
    paintMaterials.forEach((mat) => mat?.dispose && mat.dispose());
  } else if (paintMaterials?.dispose) {
    paintMaterials.dispose();
  }
}

function applyPaintToBuildingMesh(mesh, colorHex = PAINT_TOWN_DEFAULT_COLOR.hex) {
  if (!mesh) return;
  const normalizedColor = normalizePaintColorHex(colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);

  if (!mesh.userData?.paintTownPainted) {
    mesh.userData.paintTownOriginalMaterial = mesh.material;
    const detailVisibility = [];
    mesh.children.forEach((child) => {
      if (child?.userData?.photorealBuildingDetail) {
        detailVisibility.push({ child, visible: child.visible });
        child.visible = false;
      }
    });
    mesh.userData.paintTownDetailVisibility = detailVisibility;
    mesh.userData.paintTownPainted = true;
  } else if (mesh.userData.paintTownColorHex === normalizedColor) {
    return;
  } else {
    disposePaintTownMaterials(mesh.userData.paintTownPaintMaterials);
  }

  const paintMaterials = Array.isArray(mesh.userData.paintTownOriginalMaterial || mesh.material)
    ? (mesh.userData.paintTownOriginalMaterial || mesh.material).map((mat) => createPaintTownMaterial(mat, normalizedColor))
    : createPaintTownMaterial(mesh.userData.paintTownOriginalMaterial || mesh.material, normalizedColor);
  mesh.material = paintMaterials;
  mesh.userData.paintTownPaintMaterials = paintMaterials;
  mesh.userData.paintTownColorHex = normalizedColor;
}

function restorePaintTownMesh(mesh) {
  if (!mesh || !mesh.userData?.paintTownPainted) return;

  if (mesh.userData.paintTownOriginalMaterial) {
    mesh.material = mesh.userData.paintTownOriginalMaterial;
  }

  disposePaintTownMaterials(mesh.userData.paintTownPaintMaterials);

  if (Array.isArray(mesh.userData.paintTownDetailVisibility)) {
    mesh.userData.paintTownDetailVisibility.forEach((entry) => {
      if (entry?.child) entry.child.visible = !!entry.visible;
    });
  }

  delete mesh.userData.paintTownOriginalMaterial;
  delete mesh.userData.paintTownPaintMaterials;
  delete mesh.userData.paintTownDetailVisibility;
  delete mesh.userData.paintTownColorHex;
  delete mesh.userData.paintTownPainted;
}

function getPaintTownRules() {
  const state = ensurePaintTownState();
  state.rules = normalizePaintTownRules(state.rules);
  return state.rules;
}

function paintTownAllowsTouch() {
  const rules = getPaintTownRules();
  return rules.paintTouchMode !== 'off';
}

function paintTownAllowsGun() {
  const rules = getPaintTownRules();
  return rules.allowPaintballGun === true;
}

function preferredPaintTownTool() {
  if (paintTownAllowsGun()) return 'gun';
  if (paintTownAllowsTouch()) return 'touch';
  return 'touch';
}

function normalizePaintClaimPayload(raw = {}) {
  const key = String(raw.key || '').trim().slice(0, 120);
  if (!key) return null;
  const colorHex = normalizePaintColorHex(raw.colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const colorName = String(raw.colorName || paintColorNameFromHex(colorHex)).trim().slice(0, 24) || paintColorNameFromHex(colorHex);
  const uid = String(raw.uid || getPaintTownPlayerUid()).trim() || 'local-player';
  const method = normalizePaintMethod(raw.method);
  return {
    key,
    colorHex,
    colorName,
    uid,
    method
  };
}

function recomputePaintTownCounters() {
  const state = ensurePaintTownState();
  const totals = Object.create(null);
  const playerUid = String(state.multiplayerUid || getPaintTownPlayerUid()).trim() || 'local-player';
  let playerCount = 0;

  state.claimsByKey.forEach((claim) => {
    if (!claim) return;
    const hex = normalizePaintColorHex(claim.colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
    totals[hex] = (totals[hex] || 0) + 1;
    if (String(claim.uid || '') === playerUid) {
      playerCount += 1;
    }
  });

  state.colorCounts = totals;
  state.paintedBuildings = playerCount;
  state.paintedKeys = new Set(
    [...state.claimsByKey.entries()]
      .filter(([, claim]) => String(claim?.uid || '') === playerUid)
      .map(([key]) => key)
  );
}

function paintBuildingFromClaim(rawClaim = {}, options = {}) {
  const state = ensurePaintTownState();
  const claim = normalizePaintClaimPayload(rawClaim);
  if (!claim) return false;

  const previous = state.claimsByKey.get(claim.key);
  if (
    previous &&
    previous.colorHex === claim.colorHex &&
    previous.uid === claim.uid &&
    previous.method === claim.method
  ) {
    return false;
  }

  state.claimsByKey.set(claim.key, claim);
  const building = state.buildingByKey.get(claim.key) || null;
  const meshes = getBuildingMeshesForKey(claim.key, building);
  meshes.forEach((mesh) => applyPaintToBuildingMesh(mesh, claim.colorHex));

  recomputePaintTownCounters();

  if (options.publish !== false && typeof appCtx.publishPaintTownClaim === 'function') {
    Promise.resolve(appCtx.publishPaintTownClaim({
      key: claim.key,
      colorHex: claim.colorHex,
      colorName: claim.colorName,
      method: claim.method
    })).catch((err) => {
      console.warn('[painttown] publish claim failed:', err);
    });
  }

  return true;
}

function applyRemotePaintTownClaims(claims = [], roomId = '') {
  const state = ensurePaintTownState();
  const safeRoomId = String(roomId || '').trim();
  if (safeRoomId && state.multiplayerRoomId && safeRoomId !== state.multiplayerRoomId) return;
  state.latestRemoteClaims = Array.isArray(claims) ? claims.slice(0, 5000) : [];
  if (!Array.isArray(claims) || claims.length === 0) {
    recomputePaintTownCounters();
    return;
  }
  for (let i = 0; i < claims.length; i++) {
    paintBuildingFromClaim(claims[i], { publish: false });
  }
  state.remoteSyncRevision += 1;
  updatePaintTownHud();
}

function setPaintTownPlayerColor(colorHex) {
  const state = ensurePaintTownState();
  state.playerColorHex = setPreferredPaintTownColor(colorHex, state.multiplayerUid || getPaintTownPlayerUid());
  updatePaintTownHud();
}

function setPaintTownActiveTool(nextTool) {
  const state = ensurePaintTownState();
  const desired = String(nextTool || '').toLowerCase() === 'gun' ? 'gun' : 'touch';
  if (desired === 'touch' && !paintTownAllowsTouch()) {
    state.activeTool = paintTownAllowsGun() ? 'gun' : preferredPaintTownTool();
    return;
  }
  if (desired === 'gun' && !paintTownAllowsGun()) {
    state.activeTool = paintTownAllowsTouch() ? 'touch' : preferredPaintTownTool();
    return;
  }
  state.activeTool = desired;
}

function updatePaintTownHud(message = '', options = {}) {
  const state = ensurePaintTownState();
  const hud = ensurePaintTownHud();
  if (!state.active) {
    hud.style.display = 'none';
    hud.classList.remove('show');
    state.hudRenderSig = '';
    return;
  }

  const force = options && options.force === true;
  const rules = getPaintTownRules();
  const hint = message || state.lastHint || '';
  const canTouch = rules.paintTouchMode !== 'off';
  const canGun = rules.allowPaintballGun === true;
  if (state.activeTool === 'touch' && !canTouch) state.activeTool = canGun ? 'gun' : preferredPaintTownTool();
  if (state.activeTool === 'gun' && !canGun) state.activeTool = canTouch ? 'touch' : preferredPaintTownTool();

  const timeText = fmtTime(state.timerSec);
  const countText = `${state.paintedBuildings}/${state.totalBuildings}`;
  const hudSignature = [
    timeText,
    countText,
    state.hudExpanded ? 'expanded' : 'compact',
    state.activeTool,
    normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex),
    hint
  ].join('|');
  if (!force && hudSignature === state.hudRenderSig) return;
  state.hudRenderSig = hudSignature;

  if (!state.hudExpanded) {
    hud.innerHTML = '' +
      `<button type="button" data-paint-toggle="open" style="display:flex;align-items:center;gap:12px;width:100%;background:transparent;border:0;color:#f8fafc;padding:0;margin:0;font:inherit;cursor:pointer">` +
      `<span style="font-weight:700">Time ${timeText}</span>` +
      `<span style="font-weight:700">Painted ${countText}</span>` +
      `<span style="margin-left:auto;color:#cbd5e1;font-size:12px">▾</span>` +
      `</button>`;
  } else {
    const colorButtons = PAINT_TOWN_COLORS.map((entry) => {
      const normalizedEntryHex = normalizePaintColorHex(entry.hex);
      const active = normalizePaintColorHex(state.playerColorHex) === normalizedEntryHex;
      return `<button type="button" data-paint-color="${normalizedEntryHex}" title="${entry.name}" style="width:20px;height:20px;border-radius:999px;border:${active ? '2px solid #f8fafc' : '1px solid rgba(248,250,252,0.35)'};background:${normalizedEntryHex};cursor:pointer;padding:0;outline:none"></button>`;
    }).join('');

    const toolButtons = [
      { id: 'touch', label: rules.paintTouchMode === 'roof' ? 'Touch (Roof)' : 'Touch', enabled: canTouch },
      { id: 'gun', label: 'Paintball Gun', enabled: canGun }
    ].map((tool) => {
      const active = state.activeTool === tool.id;
      const disabled = !tool.enabled;
      return `<button type="button" data-paint-tool="${tool.id}" ${disabled ? 'disabled' : ''} style="border:${active ? '1px solid #f8fafc' : '1px solid rgba(148,163,184,0.55)'};background:${active ? 'rgba(30,64,175,0.45)' : 'rgba(15,23,42,0.45)'};color:${disabled ? '#64748b' : '#e2e8f0'};border-radius:8px;padding:5px 9px;font-size:11px;font-weight:600;cursor:${disabled ? 'not-allowed' : 'pointer'}">${tool.label}</button>`;
    }).join('');

    const selectedColorName = paintColorNameFromHex(state.playerColorHex);
    hud.innerHTML = '' +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">` +
      `<div style="font-weight:700;color:#fecaca">🟥 Paint the Town</div>` +
      `<button type="button" data-paint-toggle="close" style="margin-left:auto;border:1px solid rgba(148,163,184,0.6);background:rgba(15,23,42,0.45);color:#e2e8f0;border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer">Collapse</button>` +
      `</div>` +
      `<div style="font-weight:600">Time: ${timeText} • Buildings: ${countText}</div>` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px">${toolButtons}</div>` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px"><span style="font-size:11px;color:#cbd5e1">Color:</span>${colorButtons}<span style="font-size:11px;color:#cbd5e1">(${selectedColorName})</span></div>` +
      `<div style="margin-top:6px;color:#cbd5e1;font-size:11px">Press Ctrl (Control) to fire paintballs. Gun shots arc with gravity, so aim higher for far targets.</div>` +
      (hint ? `<div style="margin-top:4px;color:#cbd5e1;font-size:11px">${hint}</div>` : '');
  }

  hud.style.display = 'block';
  hud.classList.add('show');

  if (!state.hudBound) {
    state.hudBound = true;
    hud.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const toggleBtn = target.closest('button[data-paint-toggle]');
      if (toggleBtn instanceof HTMLElement) {
        state.hudExpanded = String(toggleBtn.dataset.paintToggle || '') === 'open';
        state.hudRenderSig = '';
        updatePaintTownHud('', { force: true });
        return;
      }

      const colorBtn = target.closest('button[data-paint-color]');
      if (colorBtn instanceof HTMLElement) {
        const nextHex = String(colorBtn.dataset.paintColor || '').trim();
        if (nextHex) {
          setPaintTownPlayerColor(nextHex);
          state.hudRenderSig = '';
          updatePaintTownHud('', { force: true });
        }
        return;
      }

      const toolBtn = target.closest('button[data-paint-tool]');
      if (toolBtn instanceof HTMLElement) {
        setPaintTownActiveTool(toolBtn.dataset.paintTool || '');
        state.hudRenderSig = '';
        updatePaintTownHud('', { force: true });
      }
    });
  }
}

function removePaintballProjectile(projectile) {
  if (!projectile) return;
  if (projectile.mesh?.parent) projectile.mesh.parent.remove(projectile.mesh);
  if (projectile.mesh?.geometry?.dispose) projectile.mesh.geometry.dispose();
  if (projectile.mesh?.material?.dispose) projectile.mesh.material.dispose();
}

function clearPaintballs() {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintballs) || state.paintballs.length === 0) return;
  state.paintballs.forEach((projectile) => removePaintballProjectile(projectile));
  state.paintballs = [];
}

function removePaintSplat(splat) {
  if (!splat) return;
  if (splat.mesh?.parent) splat.mesh.parent.remove(splat.mesh);
  if (splat.mesh?.geometry?.dispose) splat.mesh.geometry.dispose();
  if (splat.mesh?.material?.dispose) splat.mesh.material.dispose();
}

function clearPaintSplats() {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintSplats) || state.paintSplats.length === 0) return;
  state.paintSplats.forEach((splat) => removePaintSplat(splat));
  state.paintSplats = [];
}

function createPaintSplatMesh(colorHex) {
  if (typeof THREE === 'undefined') return null;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(PAINT_SPLAT_RADIUS_M, 12),
    new THREE.MeshBasicMaterial({
      color: paintColorHexToInt(colorHex),
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.renderOrder = 12;
  mesh.frustumCulled = true;
  return mesh;
}

function spawnPaintSplatAt(point, colorHex) {
  const state = ensurePaintTownState();
  if (!appCtx.scene || !Array.isArray(state.paintSplats)) return;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
  const mesh = createPaintSplatMesh(colorHex);
  if (!mesh) return;

  const y = Number.isFinite(point.y) ? point.y : 0;
  mesh.position.set(point.x, y + 0.025, point.z);
  appCtx.scene.add(mesh);

  while (state.paintSplats.length >= PAINT_SPLAT_MAX_ACTIVE) {
    const oldest = state.paintSplats.shift();
    removePaintSplat(oldest);
  }
  state.paintSplats.push({
    mesh,
    lifeSec: PAINT_SPLAT_LIFETIME_SEC,
    maxLifeSec: PAINT_SPLAT_LIFETIME_SEC
  });
}

function updatePaintSplats(dt) {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintSplats) || state.paintSplats.length === 0) return;
  for (let i = state.paintSplats.length - 1; i >= 0; i--) {
    const splat = state.paintSplats[i];
    if (!splat || !splat.mesh) {
      state.paintSplats.splice(i, 1);
      continue;
    }
    splat.lifeSec -= dt;
    const lifeRatio = splat.maxLifeSec > 0 ? Math.max(0, Math.min(1, splat.lifeSec / splat.maxLifeSec)) : 0;
    if (splat.mesh.material && typeof splat.mesh.material.opacity === 'number') {
      splat.mesh.material.opacity = 0.18 + lifeRatio * 0.54;
    }
    const scale = 0.95 + (1 - lifeRatio) * 0.22;
    splat.mesh.scale.setScalar(scale);
    if (splat.lifeSec <= 0) {
      removePaintSplat(splat);
      state.paintSplats.splice(i, 1);
    }
  }
}

function getPaintTownRaycaster() {
  if (typeof appCtx._getPhysRaycaster === 'function') {
    return appCtx._getPhysRaycaster();
  }
  if (typeof THREE !== 'undefined') {
    if (!appCtx._paintTownRaycaster) appCtx._paintTownRaycaster = new THREE.Raycaster();
    return appCtx._paintTownRaycaster;
  }
  return null;
}

function getPaintTownRaycastMeshes() {
  if (!Array.isArray(appCtx.buildingMeshes)) return [];
  return appCtx.buildingMeshes.filter((mesh) => mesh && mesh.visible && !mesh.userData?.isBuildingBatch);
}

function projectPaintTownRay(clientX, clientY) {
  if (typeof THREE === 'undefined' || !appCtx.camera || !appCtx.renderer) return null;
  const canvas = appCtx.renderer?.domElement;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const pointer = new THREE.Vector2(ndcX, ndcY);
  const raycaster = getPaintTownRaycaster();
  if (!raycaster) return null;
  if (typeof appCtx.camera.updateProjectionMatrix === 'function') {
    appCtx.camera.updateProjectionMatrix();
  }
  if (typeof appCtx.camera.updateMatrixWorld === 'function') {
    appCtx.camera.updateMatrixWorld(true);
  }
  raycaster.setFromCamera(pointer, appCtx.camera);
  return raycaster;
}

function shouldIgnorePaintTownInput(eventTarget) {
  if (!(eventTarget instanceof Element)) return false;
  const blocker = eventTarget.closest(
    '#titleScreen, #roomPanelModal, #largeMap, #propertyPanel, #propertyModal, #historicPanel, #pauseScreen, #resultScreen, #caughtScreen, #flowerChallengePanel, #gameShareMenu, #controlsTab, #settings-menu, #memoryComposer, #memoryPanel, #paintTownHud'
  );
  if (!blocker) return false;

  // Do not block gameplay when focus remains on a hidden title/menu element.
  if (blocker.classList.contains('hidden')) return false;
  if (blocker.hasAttribute('hidden')) return false;
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(blocker) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

function ensurePaintTownInputBindings() {
  const state = ensurePaintTownState();
  if (state.inputBound) return;
  state.inputBound = true;

  const handlePointerDown = (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== 'painttown') return;
    if (appCtx.worldLoading) return;
    if (shouldIgnorePaintTownInput(event.target)) return;
    if (event instanceof MouseEvent && event.button !== 0) return;

    const canTouch = paintTownAllowsTouch();
    const canGun = paintTownAllowsGun();
    const pointerType = String(event.pointerType || '').toLowerCase();
    const isPrimaryTap = pointerType === 'touch' || pointerType === 'pen' || !(event instanceof MouseEvent) || event.button === 0;
    const useGun = paintState.activeTool === 'gun';

    if (!useGun && canTouch && isPrimaryTap) {
      const touched = tryTouchPaintAt(event.clientX, event.clientY);
      if (touched) {
        event.preventDefault();
        return;
      }
    }

    if (canGun && (useGun || !canTouch)) {
      if (firePaintball(event.clientX, event.clientY)) {
        event.preventDefault();
      }
    }
  };

  const handleKeyDown = (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== 'painttown') return;
    if (shouldIgnorePaintTownInput(document.activeElement)) return;
    if (event.repeat) return;

    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '');
    const isCtrlFireKey =
      key === 'control' ||
      key === 'ctrl' ||
      code === 'ControlLeft' ||
      code === 'ControlRight' ||
      code === 'Control';
    if (isCtrlFireKey) {
      if (!paintTownAllowsGun()) return;
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      if (firePaintball(cx, cy)) event.preventDefault();
      return;
    }

    if (key === 'g' || key === 'p') {
      if (!paintTownAllowsGun()) return;
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      if (firePaintball(cx, cy)) event.preventDefault();
      return;
    }
    if (key >= '1' && key <= String(Math.min(PAINT_TOWN_COLORS.length, 9))) {
      const idx = Number(key) - 1;
      const choice = PAINT_TOWN_COLORS[idx];
      if (choice) {
        setPaintTownPlayerColor(choice.hex);
        updatePaintTownHud();
        event.preventDefault();
      }
      return;
    }
    if (key === 't') {
      const next = ensurePaintTownState().activeTool === 'gun' ? 'touch' : 'gun';
      setPaintTownActiveTool(next);
      updatePaintTownHud();
      event.preventDefault();
    }
  };

  document.addEventListener('pointerdown', handlePointerDown, { capture: true });
  document.addEventListener('contextmenu', (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.gameMode !== 'painttown') return;
    if (!paintTownAllowsGun()) return;
    if (shouldIgnorePaintTownInput(event.target)) return;
    event.preventDefault();
  });
  window.addEventListener('keydown', handleKeyDown, { capture: true });
}

function getPaintTownShootOrigin() {
  const actor = getPaintTownActorState();
  if (!actor) return null;
  const mode = actor.mode;
  if (mode === 'drone') {
    return { x: actor.x, y: actor.feetY, z: actor.z };
  }
  if (mode === 'walking') {
    const eyeHeight = appCtx.Walk?.CFG?.eyeHeight || 1.7;
    return { x: actor.x, y: actor.feetY + eyeHeight * 0.92, z: actor.z };
  }
  return { x: actor.x, y: actor.feetY + 1.25, z: actor.z };
}

function createPaintballMesh(colorHex) {
  if (typeof THREE === 'undefined') return null;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PAINTBALL_RADIUS_M, 8, 8),
    new THREE.MeshStandardMaterial({
      color: paintColorHexToInt(colorHex),
      emissive: paintColorHexToInt(colorHex),
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.05
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function firePaintball(clientX, clientY) {
  const state = ensurePaintTownState();
  if (!paintTownAllowsGun()) return false;
  if (Date.now() - Number(state.lastShotAtMs || 0) < PAINTBALL_SHOT_COOLDOWN_MS) return false;

  const raycaster = projectPaintTownRay(clientX, clientY);
  if (!raycaster || !raycaster.ray) return false;
  const origin = getPaintTownShootOrigin();
  if (!origin) return false;
  const dir = raycaster.ray.direction.clone();
  if (dir.lengthSq() <= 0.000001) return false;
  dir.normalize();

  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const mesh = createPaintballMesh(colorHex);
  if (!mesh || !appCtx.scene) return false;

  mesh.position.set(origin.x + dir.x * 1.8, origin.y + dir.y * 1.8, origin.z + dir.z * 1.8);
  appCtx.scene.add(mesh);

  while (state.paintballs.length >= PAINTBALL_MAX_ACTIVE) {
    const oldest = state.paintballs.shift();
    removePaintballProjectile(oldest);
  }

  const velocity = dir.multiplyScalar(PAINTBALL_SPEED_MPS);
  state.paintballs.push({
    mesh,
    vel: velocity,
    lifeSec: PAINTBALL_LIFETIME_SEC,
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    prev: mesh.position.clone()
  });
  state.lastShotAtMs = Date.now();
  state.lastHint = 'Paintball launched.';
  return true;
}

function tryTouchPaintAt(clientX, clientY) {
  const rules = getPaintTownRules();
  const touchMode = rules.paintTouchMode;
  if (touchMode === 'off') return false;
  const raycaster = projectPaintTownRay(clientX, clientY);
  if (!raycaster) return false;

  const meshes = getPaintTownRaycastMeshes();
  if (!meshes.length) return false;
  if (appCtx.scene && typeof appCtx.scene.updateMatrixWorld === 'function') {
    appCtx.scene.updateMatrixWorld(true);
  }
  const hits = raycaster.intersectObjects(meshes, true);
  if (!Array.isArray(hits) || hits.length === 0) return false;
  const hit = hits[0];
  if (!hit || !hit.object) return false;

  if (touchMode === 'roof' && hit.face && typeof hit.face.normal?.clone === 'function') {
    const worldNormal = hit.face.normal.clone();
    if (hit.object.matrixWorld) worldNormal.transformDirection(hit.object.matrixWorld);
    if (Number(worldNormal.y) < 0.45) {
      const state = ensurePaintTownState();
      state.lastHint = 'Roof-only mode: tap a rooftop surface.';
      updatePaintTownHud();
      return false;
    }
  }

  const key = resolveBuildingKeyFromMesh(hit.object, hit.point || null);
  if (!key) return false;
  const state = ensurePaintTownState();
  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const method = touchMode === 'roof' ? 'touch-roof' : 'touch-any';
  const painted = paintBuildingFromClaim({
    key,
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    method
  }, { publish: true });
  if (painted) {
    state.lastHint = `Painted ${state.paintedBuildings}/${state.totalBuildings}.`;
    updatePaintTownHud();
  }
  return painted;
}

function updatePaintballProjectiles(dt) {
  const state = ensurePaintTownState();
  updatePaintSplats(dt);
  if (!Array.isArray(state.paintballs) || state.paintballs.length === 0) return;

  const meshes = getPaintTownRaycastMeshes();
  const raycaster = getPaintTownRaycaster();
  const gravityStep = PAINTBALL_GRAVITY_MPS2 * dt;
  if (appCtx.scene && typeof appCtx.scene.updateMatrixWorld === 'function') {
    appCtx.scene.updateMatrixWorld(true);
  }

  for (let i = state.paintballs.length - 1; i >= 0; i--) {
    const shot = state.paintballs[i];
    if (!shot || !shot.mesh) {
      state.paintballs.splice(i, 1);
      continue;
    }

    const prev = shot.mesh.position.clone();
    shot.vel.y -= gravityStep;
    shot.mesh.position.x += shot.vel.x * dt;
    shot.mesh.position.y += shot.vel.y * dt;
    shot.mesh.position.z += shot.vel.z * dt;
    shot.lifeSec -= dt;

    let consumed = false;
    if (raycaster && meshes.length > 0) {
      const next = shot.mesh.position;
      const dir = next.clone().sub(prev);
      const dist = dir.length();
      if (dist > 0.0001) {
        dir.normalize();
        raycaster.set(prev, dir);
        const hits = raycaster.intersectObjects(meshes, true);
        const hit = Array.isArray(hits) ? hits.find((entry) => Number(entry.distance) <= dist + PAINTBALL_RADIUS_M) : null;
        if (hit && hit.object) {
          const key = resolveBuildingKeyFromMesh(hit.object, hit.point || next);
          if (key) {
            const painted = paintBuildingFromClaim({
              key,
              colorHex: shot.colorHex,
              colorName: shot.colorName,
              uid: String(shot.uid || state.multiplayerUid || getPaintTownPlayerUid()),
              method: 'gun'
            }, { publish: true });
            if (painted) {
              state.lastHint = `Paintball hit! ${state.paintedBuildings}/${state.totalBuildings}.`;
              updatePaintTownHud();
            }
          }
          consumed = true;
        }
      }
    }

    if (!consumed) {
      let terrainY = -Infinity;
      if (typeof appCtx.terrainMeshHeightAt === 'function') {
        const h = appCtx.terrainMeshHeightAt(shot.mesh.position.x, shot.mesh.position.z);
        if (Number.isFinite(h)) terrainY = h;
      }
      if (!Number.isFinite(terrainY) && typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
        const h = appCtx.elevationWorldYAtWorldXZ(shot.mesh.position.x, shot.mesh.position.z);
        if (Number.isFinite(h)) terrainY = h;
      }
      if (Number.isFinite(terrainY) && shot.mesh.position.y <= terrainY + 0.1) {
        spawnPaintSplatAt({
          x: shot.mesh.position.x,
          y: terrainY,
          z: shot.mesh.position.z
        }, shot.colorHex);
        consumed = true;
      }
    }

    if (consumed || shot.lifeSec <= 0 || !Number.isFinite(shot.mesh.position.y) || shot.mesh.position.y < -1000) {
      removePaintballProjectile(shot);
      state.paintballs.splice(i, 1);
    }
  }
}

function resetPaintTownMode() {
  const state = ensurePaintTownState();
  state.active = false;
  state.totalBuildings = 0;
  state.paintedBuildings = 0;
  state.paintedKeys.clear();
  state.claimsByKey.clear();
  state.colorCounts = {};
  state.timerSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
  state.lastHint = '';
  state.autoPaintTickSec = 0;
  state.scoreSubmitted = false;
  state.lastShotAtMs = 0;
  clearPaintballs();
  clearPaintSplats();

  if (Array.isArray(appCtx.buildingMeshes)) {
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      restorePaintTownMesh(appCtx.buildingMeshes[i]);
    }
  }
  updatePaintTownHud('');
}

function startPaintTownMode() {
  const state = ensurePaintTownState();
  state.rules = normalizePaintTownRules({
    ...(state.rules || {}),
    ...(appCtx.paintTownRoomRules || {})
  });
  if (state.multiplayerUid) {
    state.playerColorHex = getPreferredPaintTownColor(state.multiplayerUid);
  } else {
    state.playerColorHex = getPreferredPaintTownColor();
  }
  setPaintTownActiveTool(preferredPaintTownTool());
  ensurePaintTownInputBindings();
  resetPaintTownMode();
  appCtx.disableNearBuildingBatching = true;

  buildPaintTownBuildingIndex();
  const buildingKeys = new Set(state.buildingByKey.keys());

  state.totalBuildings = buildingKeys.size;
  state.active = true;
  state.timerSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
  state.lastHint = 'Paint challenge started. Pick tool/color and claim buildings.';
  state.autoPaintTickSec = 0;
  state.scoreSubmitted = false;

  if (state.totalBuildings <= 0) {
    state.active = false;
    state.lastHint = 'No paintable buildings found yet. Reload world or choose a denser city.';
  } else if (Array.isArray(state.latestRemoteClaims) && state.latestRemoteClaims.length) {
    applyRemotePaintTownClaims(state.latestRemoteClaims, state.multiplayerRoomId || '');
  }

  updatePaintTownHud();
}

function stopPaintTownMode({ showSummary = false } = {}) {
  const state = ensurePaintTownState();
  if (!state.active && !showSummary) return;
  state.active = false;
  clearPaintballs();
  clearPaintSplats();
  updatePaintTownHud();

  if (!showSummary) return;
  const pct = state.totalBuildings > 0 ?
  Math.min(100, state.paintedBuildings / state.totalBuildings * 100) :
  0;
  if (!state.scoreSubmitted && typeof appCtx.submitPaintTownScore === 'function') {
    state.scoreSubmitted = true;
    const actor = getPaintTownActorState();
    appCtx.submitPaintTownScore({
      paintedPct: pct,
      paintedBuildings: state.paintedBuildings,
      totalBuildings: state.totalBuildings,
      durationMs: normalizePaintDurationSec(state.rules?.paintTimeLimitSec) * 1000,
      mode: actor?.mode || 'driving'
    });
  }
  const colorName = paintColorNameFromHex(state.playerColorHex);
  showResult(
    'Paint the Town Red',
    `Painted ${state.paintedBuildings} buildings (${colorName}) in ${fmtTime(normalizePaintDurationSec(state.rules?.paintTimeLimitSec))} (${state.totalBuildings} available)`
  );
}

function attemptAutoPaintFromActor() {
  const state = ensurePaintTownState();
  if (!state.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== 'painttown') return;
  if (state.rules?.allowRoofAutoPaint !== true) return;

  const actor = getPaintTownActorState();
  if (!actor) return;

  const hit = findPaintableRoofBuilding(actor);
  if (!hit) return;
  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const painted = paintBuildingFromClaim({
    key: hit.key,
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    method: 'roof'
  }, { publish: true });
  if (!painted) return;

  state.lastHint = `Auto-painted ${state.paintedBuildings}/${state.totalBuildings}.`;

  if (state.paintedBuildings >= state.totalBuildings && state.totalBuildings > 0) {
    stopPaintTownMode({ showSummary: true });
    return;
  }
  updatePaintTownHud();
}

function pickRoadPt() {if (appCtx.roads.length === 0) return null;const rd = appCtx.roads[Math.floor(Math.random() * appCtx.roads.length)];return rd.pts[Math.floor(Math.random() * rd.pts.length)];}

function clearObjectives() {
  resetPaintTownMode();
  if (appCtx.gameMode !== 'painttown') appCtx.disableNearBuildingBatching = false;
  appCtx.cpMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.cpMeshes = [];
  appCtx.checkpoints = [];
  appCtx.cpCollected = 0;
  if (appCtx.destMesh) {
    appCtx.scene.remove(appCtx.destMesh);
    if (appCtx.destMesh.geometry) appCtx.destMesh.geometry.dispose();
    if (appCtx.destMesh.material) {
      if (Array.isArray(appCtx.destMesh.material)) {
        appCtx.destMesh.material.forEach((mat) => mat.dispose());
      } else {
        appCtx.destMesh.material.dispose();
      }
    }
    appCtx.destMesh = null;
  }
  appCtx.destination = null;
  appCtx.trialDone = false;
}

function spawnDest() {
  clearObjectives();
  let best = null;
  for (let i = 0; i < 40; i++) {
    const p = pickRoadPt();if (!p) continue;
    const d = Math.hypot(p.x - appCtx.car.x, p.z - appCtx.car.z);
    if (d > 400 && d < 1200) {best = p;break;}
    if (!best || d > Math.hypot(best.x - appCtx.car.x, best.z - appCtx.car.z)) best = p;
  }
  if (!best) return;
  appCtx.destination = { x: best.x, z: best.z };
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  ring.rotation.x = Math.PI / 2;ring.position.y = 0.5;grp.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 8), new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.3 }));
  beam.position.y = 20;grp.add(beam);
  grp.position.set(best.x, 0, best.z);
  appCtx.scene.add(grp);appCtx.destMesh = grp;
}

function spawnCheckpoints() {
  clearObjectives();
  for (let i = 0; i < 8; i++) {
    let p = null;
    for (let t = 0; t < 60; t++) {
      const c = pickRoadPt();if (!c) continue;
      if (Math.hypot(c.x - appCtx.car.x, c.z - appCtx.car.z) < 250) continue;
      if (appCtx.checkpoints.every((cp) => Math.hypot(c.x - cp.x, c.z - cp.z) > 200)) {p = c;break;}
    }
    if (!p) p = pickRoadPt();
    if (!p) continue;
    appCtx.checkpoints.push({ x: p.x, z: p.z, collected: false, idx: i + 1 });
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.8, 8, 20), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
    ring.rotation.x = Math.PI / 2;ring.position.y = 0.5;grp.add(ring);
    grp.position.set(p.x, 0, p.z);
    appCtx.scene.add(grp);appCtx.cpMeshes.push(grp);
  }
}

function startMode() {
  appCtx.gameTimer = 0;
  clearObjectives();
  clearPolice();
  appCtx.policeOn = false;
  const policeHud = document.getElementById('police');
  if (policeHud) policeHud.classList.remove('show');
  const policeToggle = document.getElementById('fPolice');
  if (policeToggle) policeToggle.classList.remove('on');
  if (typeof appCtx.stopFlowerChallenge === 'function') appCtx.stopFlowerChallenge();
  if (appCtx.gameMode === 'trial') spawnDest();else
  if (appCtx.gameMode === 'checkpoint') spawnCheckpoints();else
  if (appCtx.gameMode === 'painttown') startPaintTownMode();else
  if (appCtx.gameMode === 'police') {
    appCtx.policeOn = true;
    if (policeHud) policeHud.classList.add('show');
    if (policeToggle) policeToggle.classList.add('on');
    spawnPolice();
  } else if (appCtx.gameMode === 'flower' && typeof appCtx.startFlowerChallenge === 'function') {
    appCtx.startFlowerChallenge('game-mode');
  }
}

function updateMode(dt) {
  if (appCtx.gameMode === 'trial' || appCtx.gameMode === 'checkpoint' || appCtx.gameMode === 'painttown') appCtx.gameTimer += dt;
  appCtx.cpMeshes.forEach((m) => m.rotation.y += dt * 1.5);
  if (appCtx.destMesh) appCtx.destMesh.rotation.y += dt * 1.2;
  if (appCtx.gameMode === 'trial' && appCtx.destination && !appCtx.trialDone) {
    const d = Math.hypot(appCtx.destination.x - appCtx.car.x, appCtx.destination.z - appCtx.car.z);
    if (d < appCtx.CFG.cpRadius) {appCtx.trialDone = true;showResult('Destination Reached!', 'Time: ' + fmtTime(appCtx.gameTimer));} else
    if (appCtx.gameTimer > appCtx.CFG.trialTime) showResult("Time's Up!", 'Result: Failed');
  }
  if (appCtx.gameMode === 'checkpoint') {
    for (let i = 0; i < appCtx.checkpoints.length; i++) {
      const cp = appCtx.checkpoints[i];if (cp.collected) continue;
      if (Math.hypot(cp.x - appCtx.car.x, cp.z - appCtx.car.z) < appCtx.CFG.cpRadius) {
        cp.collected = true;appCtx.cpCollected++;
        if (appCtx.cpMeshes[i]) appCtx.cpMeshes[i].visible = false;
        if (appCtx.cpCollected >= appCtx.checkpoints.length) showResult('All Checkpoints!', 'Time: ' + fmtTime(appCtx.gameTimer));
        break;
      }
    }
  }
  if (appCtx.gameMode === 'painttown') {
    const state = ensurePaintTownState();
    const ctrlHeld = !!(appCtx.keys?.ControlLeft || appCtx.keys?.ControlRight);
    if (state.active && ctrlHeld && !state.ctrlFireLatched && paintTownAllowsGun()) {
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      state.ctrlFireLatched = firePaintball(cx, cy);
    }
    if (!ctrlHeld) {
      state.ctrlFireLatched = false;
    }

    if (state.active) updatePaintballProjectiles(dt);
    if (state.active) {
      const durationSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
      state.timerSec = Math.max(0, durationSec - appCtx.gameTimer);
      if (state.rules?.allowRoofAutoPaint === true) {
        state.autoPaintTickSec = Math.max(0, (state.autoPaintTickSec || 0) - dt);
        if (state.autoPaintTickSec <= 0) {
          state.autoPaintTickSec = 0.15;
          attemptAutoPaintFromActor();
        }
      }
      updatePaintTownHud();
      if (state.timerSec <= 0) stopPaintTownMode({ showSummary: true });
    }
  }
}

function setPaintTownMultiplayerConfig(config = {}) {
  const state = ensurePaintTownState();
  const roomId = String(config.roomId || '').trim();
  const uid = String(config.uid || getPaintTownPlayerUid()).trim();
  const incomingRules = normalizePaintTownRules(config.rules || {});

  state.multiplayerRoomId = roomId;
  state.multiplayerUid = uid || getPaintTownPlayerUid();
  state.rules = incomingRules;
  state.roomSeed = Number.isFinite(Number(config.roomSeed)) ? Number(config.roomSeed) : null;
  appCtx.paintTownRoomRules = { ...incomingRules };

  const preferred = getPreferredPaintTownColor(state.multiplayerUid || getPaintTownPlayerUid());
  state.playerColorHex = normalizePaintColorHex(state.playerColorHex || preferred, preferred);
  setPaintTownActiveTool(preferredPaintTownTool());

  if (Array.isArray(config.claims) && config.claims.length) {
    applyRemotePaintTownClaims(config.claims, roomId);
  } else {
    recomputePaintTownCounters();
  }

  updatePaintTownHud();
}

function clearPaintTownMultiplayerConfig() {
  const state = ensurePaintTownState();
  state.multiplayerRoomId = '';
  state.multiplayerUid = '';
  state.latestRemoteClaims = [];
  state.claimsByKey.clear();
  recomputePaintTownCounters();
  state.rules = normalizePaintTownRules();
  state.roomSeed = null;
  appCtx.paintTownRoomRules = { ...state.rules };
  state.playerColorHex = getPreferredPaintTownColor();
  setPaintTownActiveTool(preferredPaintTownTool());
  updatePaintTownHud();
}

function applyPaintTownRemoteClaimsFromSync(payload = {}) {
  const roomId = String(payload.roomId || '').trim();
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  applyRemotePaintTownClaims(claims, roomId);
}

function fmtTime(s) {s = Math.max(0, Math.floor(s));return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');}
function showResult(title, stats) {document.getElementById('resultTitle').textContent = title;document.getElementById('resultStats').textContent = stats;document.getElementById('resultScreen').classList.add('show');appCtx.paused = true;}
function hideResult() {document.getElementById('resultScreen').classList.remove('show');}

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
  hideResult,
  isPOIVisible,
  loadPropertiesAtCurrentLocation,
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openModalById,
  paintTownDebugFirePaintballAt: firePaintball,
  paintTownDebugTryTouchPaintAt: tryTouchPaintAt,
  paintTownDebugUpdatePaintballs: updatePaintballProjectiles,
  paintTownDebugSnapshot: () => {
    const state = ensurePaintTownState();
    return {
      active: !!state.active,
      totalBuildings: Number(state.totalBuildings || 0),
      paintedBuildings: Number(state.paintedBuildings || 0),
      paintballs: Array.isArray(state.paintballs) ? state.paintballs.length : 0,
      paintSplats: Array.isArray(state.paintSplats) ? state.paintSplats.length : 0,
      playerColorHex: normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex),
      activeTool: String(state.activeTool || ''),
      hudExpanded: state.hudExpanded === true,
      rules: { ...(state.rules || {}) },
      colorCounts: { ...(state.colorCounts || {}) },
      claims: state.claimsByKey instanceof Map
        ? [...state.claimsByKey.values()].map((claim) => ({ ...claim }))
        : []
    };
  },
  pickRoadPt,
  renderPropertyMarkers,
  showMapInfo,
  showResult,
  setPaintTownMultiplayerConfig,
  setPaintTownPlayerColor,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startPaintTownMode,
  startMode,
  stopPaintTownMode,
  toggleAllGameElements,
  toggleAllLayers,
  toggleAllPOIs,
  toggleHistoric,
  togglePropertyFilters,
  toggleRealEstate,
  toggleRoads,
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
  hideResult,
  isPOIVisible,
  loadPropertiesAtCurrentLocation,
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openModalById,
  pickRoadPt,
  renderPropertyMarkers,
  showMapInfo,
  showResult,
  setPaintTownMultiplayerConfig,
  setPaintTownPlayerColor,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startPaintTownMode,
  startMode,
  stopPaintTownMode,
  toggleAllGameElements,
  toggleAllLayers,
  toggleAllPOIs,
  toggleHistoric,
  togglePropertyFilters,
  toggleRealEstate,
  toggleRoads,
  updateHistoricPanel,
  updateMapLayers,
  updateMode,
  updateNavigationRoute,
  updateNearbyPOI,
  updatePolice,
  updatePropertyPanel };
