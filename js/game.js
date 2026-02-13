// ============================================================================
// game.js - Game modes, police, POI, real estate UI, historic sites, navigation
// ============================================================================

function updateNearbyPOI() {
    const poiInfo = document.getElementById('poiInfo');

    // Only update POI display if POI mode is enabled
    if (!poiMode) {
        if (nearestPOI) {
            nearestPOI = null;
            poiInfo.style.display = 'none';
        }
        return;
    }

    let closest = null;
    let minDist = Infinity;

    pois.forEach(poi => {
        const dx = poi.x - car.x;
        const dz = poi.z - car.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < minDist && dist < 150) { // Within 150m
            minDist = dist;
            closest = { ...poi, dist };
        }
    });

    if (closest && (closest !== nearestPOI || Math.abs(closest.dist - nearestPOI?.dist) > 5)) {
        nearestPOI = closest;
        document.getElementById('poiIcon').textContent = closest.icon;
        document.getElementById('poiName').textContent = closest.name;
        document.getElementById('poiCategory').textContent = closest.category;
        document.getElementById('poiDistance').textContent = Math.floor(closest.dist) + 'm ahead';
        poiInfo.style.display = 'block';
    } else if (!closest && nearestPOI) {
        nearestPOI = null;
        poiInfo.style.display = 'none';
    }
}

// ==================== REAL ESTATE UI FUNCTIONS ====================

function formatPrice(v) {
  return '$' + Math.round(v).toLocaleString();
}

function createPropertyCard(p) {
  // Photo with intelligent fallback
  let photoHTML;
  if (p.primaryPhoto) {
    photoHTML = `<img src="${p.primaryPhoto}" alt="${p.address}" crossorigin="anonymous" onerror="this.onerror=null; this.src='https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${p.lat},${p.lon}&key=YOUR_API_KEY&source=outdoor'">`;
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

  const isSelected = selectedProperty && selectedProperty.id === p.id;
  const distance = Math.round(p.distance);
  const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';

  return `
  <div class="property-card" onclick="openModalById('${p.id}')" style="position:relative;margin-bottom:10px">
    <div class="prop-photo" style="height:140px">${photoHTML}${sourceTag}</div>
    <div class="prop-info">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <div class="prop-price" style="font-size:18px">${formatPrice(p.price)}${p.priceType==='rent'?'/mo':''}</div>
        <div style="font-size:11px;color:#10b981;font-weight:600;background:#d1fae5;padding:3px 6px;border-radius:4px">📍 ${distanceText}</div>
      </div>
      <div class="prop-address" style="font-size:12px">${p.address}</div>
      <div class="prop-details" style="font-size:11px;gap:8px">🛏 ${p.beds} 🚿 ${p.baths} 📐 ${p.sqft}</div>
      <button onclick="event.stopPropagation(); navigateToProperty('${p.id}')" style="width:100%;background:${isSelected ? '#10b981' : '#667eea'};border:none;border-radius:6px;padding:6px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;font-size:11px;margin-top:6px;transition:all 0.2s">${isSelected ? '✓ Navigating' : '🧭 Navigate'}</button>
    </div>
  </div>`;
}

function updatePropertyPanel() {
  if (!PropertyUI.list) return;

  // Calculate distances and add to properties
  properties.forEach(p => {
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    p.distance = Math.sqrt(dx * dx + dz * dz);
  });

  // Filter by radius
  const radiusMeters = propertyRadius * 1000;
  let filtered = properties.filter(p => p.distance <= radiusMeters);

  // Filter by property type (sale/rent/all)
  if (propertyTypeFilter !== 'all') {
    filtered = filtered.filter(p => p.priceType === propertyTypeFilter);
  }

  // Sort properties
  switch(propertySort) {
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
  properties.forEach(p => sources[p.source] = (sources[p.source] || 0) + 1);
  const sourceText = Object.entries(sources).map(([k,v]) => `${v} ${k}`).join(', ');
  document.getElementById('propertySource').textContent = sourceText;

  // Update data source label in header
  const hasRealData = properties.some(p => !p.isDemo && p.source !== 'demo');
  const primarySource = hasRealData
    ? (properties.find(p => p.source === 'rentcast') ? 'RentCast (Live)' :
       properties.find(p => p.source === 'estated') ? 'Estated (Live)' :
       properties.find(p => p.source === 'attom') ? 'ATTOM (Live)' : 'Demo Data')
    : 'Demo Data';
  document.getElementById('dataSourceLabel').textContent = `Source: ${primarySource}`;

  // Render cards
  PropertyUI.list.innerHTML = filtered.map(createPropertyCard).join('');
  if (PropertyUI.panel) PropertyUI.panel.classList.add('show');
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
  return category ? mapLayers[category] : false;
}

function closeLegend() {
  document.getElementById('legendPanel').style.display = 'none';
}

function updateMapLayers() {
  mapLayers.properties = document.getElementById('filterProperties').checked;
  mapLayers.navigation = document.getElementById('filterNavigation').checked;
  mapLayers.schools = document.getElementById('filterSchools').checked;
  mapLayers.healthcare = document.getElementById('filterHealthcare').checked;
  mapLayers.emergency = document.getElementById('filterEmergency').checked;
  mapLayers.food = document.getElementById('filterFood').checked;
  mapLayers.shopping = document.getElementById('filterShopping').checked;
  mapLayers.culture = document.getElementById('filterCulture').checked;
  mapLayers.historic = document.getElementById('filterHistoric').checked;
  mapLayers.parks = document.getElementById('filterParks').checked;
  mapLayers.parking = document.getElementById('filterParking').checked;
  mapLayers.fuel = document.getElementById('filterFuel').checked;
  mapLayers.banks = document.getElementById('filterBanks').checked;
  mapLayers.postal = document.getElementById('filterPostal').checked;
  mapLayers.hotels = document.getElementById('filterHotels').checked;
  mapLayers.tourism = document.getElementById('filterTourism').checked;
  mapLayers.checkpoints = document.getElementById('filterCheckpoints').checked;
  mapLayers.destination = document.getElementById('filterDestination').checked;
  mapLayers.customTrack = document.getElementById('filterCustomTrack').checked;
  mapLayers.police = document.getElementById('filterPolice').checked;

  // Update parent checkboxes
  const allPOIs = mapLayers.schools && mapLayers.healthcare && mapLayers.emergency &&
                  mapLayers.food && mapLayers.shopping && mapLayers.culture &&
                  mapLayers.historic && mapLayers.parks && mapLayers.parking &&
                  mapLayers.fuel && mapLayers.banks && mapLayers.postal &&
                  mapLayers.hotels && mapLayers.tourism;
  document.getElementById('filterPOIsAll').checked = allPOIs;

  const allGameElements = mapLayers.checkpoints && mapLayers.destination && mapLayers.customTrack;
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
  document.getElementById('filterRoads').checked = state;
  showRoads = state;
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
  showRoads = document.getElementById('filterRoads').checked;
  mapLayers.roads = showRoads;
  document.getElementById('mapRoadsToggle').classList.toggle('active', showRoads);
  const floatRoads = document.getElementById('fRoads');
  if (floatRoads) floatRoads.classList.toggle('on', showRoads);
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
    const distance = Math.round(Math.sqrt((data.x - car.x)**2 + (data.z - car.z)**2));
    const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${formatPrice(data.price)}${data.priceType==='rent'?'/mo':''}</div>
        <div style="font-size:12px;opacity:0.9;margin-bottom:4px">${data.address}</div>
        <div style="font-size:11px;opacity:0.8">${data.city}, ${data.state} ${data.zipCode}</div>
      </div>
      <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
        <div>🛏️ <strong>${data.beds}</strong> beds</div>
        <div>🚿 <strong>${data.baths}</strong> baths</div>
        <div>📐 <strong>${data.sqft}</strong> sqft</div>
        <div>📅 <strong>${data.yearBuilt || 'N/A'}</strong></div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${distanceText}</strong></div>
        <div style="opacity:0.8">🏷️ Type: <strong>${data.propertyType}</strong></div>
      </div>
      <button onclick="navigateToProperty('${data.id}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
      <button onclick="openModalById('${data.id}'); closeMapInfo();" style="width:100%;background:rgba(0,255,200,0.2);color:#0fc;border:1px solid #0fc;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
    `;
  } else if (type === 'poi') {
    title.textContent = data.icon + ' ' + data.category;
    const distance = Math.round(Math.sqrt((data.x - car.x)**2 + (data.z - car.z)**2));
    const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#0ff;margin-bottom:6px">${data.name}</div>
        <div style="font-size:11px;opacity:0.8">${data.category}</div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${distanceText}</strong></div>
      </div>
      <button onclick="navigateToPOI(${data.x}, ${data.z}, '${data.name}'); closeMapInfo();" style="width:100%;background:#0fc;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px">🧭 NAVIGATE HERE</button>
    `;
  } else if (type === 'historic') {
    title.textContent = '⛩️ Historic Site';
    const distance = Math.round(Math.sqrt((data.x - car.x)**2 + (data.z - car.z)**2));
    const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';

    content.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:16px;font-weight:bold;color:#f59e0b;margin-bottom:6px">${data.name}</div>
        <div style="font-size:11px;opacity:0.8">${data.category}</div>
      </div>
      <div style="margin-bottom:12px;font-size:10px">
        <div style="opacity:0.8">📍 Distance: <strong>${distanceText}</strong></div>
      </div>
      <button onclick="navigateToHistoric('${data.name}'); closeMapInfo();" style="width:100%;background:#f59e0b;color:#000;border:none;border-radius:6px;padding:10px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:11px;margin-bottom:6px">🧭 NAVIGATE HERE</button>
      <button onclick="openHistoricModal('${data.name}'); closeMapInfo();" style="width:100%;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid #f59e0b;border-radius:6px;padding:8px;font-family:Orbitron;font-weight:bold;cursor:pointer;font-size:10px">📋 FULL DETAILS</button>
    `;
  }
}

function navigateToPOI(x, z, name) {
  selectedProperty = null;
  selectedHistoric = null;
  showNavigation = true;

  createNavigationRoute(car.x, car.z, x, z);
  // Debug log removed
}

function openModalById(id) {
  const p = properties.find(x => x.id === id);
  if (!p || !PropertyUI.modal) return;

  PropertyUI.modalTitle.textContent = p.address;

  const photos = p.photos && p.photos.length > 0
    ? p.photos.slice(0, 3).map(url => `<img src="${url}" crossorigin="anonymous" style="width:100%;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'">`).join('')
    : p.primaryPhoto
    ? `<img src="${p.primaryPhoto}" crossorigin="anonymous" style="width:100%;border-radius:12px;margin-bottom:16px" onerror="this.style.display='none'">`
    : `<div style="width:100%;height:200px;background:#f1f5f9;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">🏠</div>`;

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

  const isSelected = selectedProperty && selectedProperty.id === p.id;
  const navButtons = `
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="navigateToProperty('${p.id}')" style="flex:1;background:${isSelected ? '#10b981' : '#667eea'};border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Navigate Here'}
      </button>
      ${isSelected ? `<button onclick="clearNavigation()" style="flex:1;background:#ef4444;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">✕ Clear Route</button>` : ''}
    </div>
  `;

  PropertyUI.modalBody.innerHTML = `
    ${sourceNotice}
    ${photos}
    <div class="prop-stat">
      <span class="prop-stat-label">Price</span>
      <span class="prop-stat-value">${formatPrice(p.price)}${p.priceType==='rent'?'/mo':''}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Bedrooms</span>
      <span class="prop-stat-value">${p.beds}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Bathrooms</span>
      <span class="prop-stat-value">${p.baths}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Square Feet</span>
      <span class="prop-stat-value">${p.sqft.toLocaleString()}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Price per sqft</span>
      <span class="prop-stat-value">${formatPrice(p.pricePerSqft)}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Property Type</span>
      <span class="prop-stat-value">${p.propertyType}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Year Built</span>
      <span class="prop-stat-value">${p.yearBuilt || 'N/A'}</span>
    </div>
    ${p.daysOnMarket ? `<div class="prop-stat">
      <span class="prop-stat-label">Days on Market</span>
      <span class="prop-stat-value">${p.daysOnMarket}</span>
    </div>` : ''}
    ${navButtons}
    ${p.sourceUrl ? `<button onclick="window.open('${p.sourceUrl}','_blank')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">🔗 View Full Listing</button>` : ''}
  `;
  PropertyUI.modal.classList.add('show');
}

function closeModal() {
  if (PropertyUI.modal) PropertyUI.modal.classList.remove('show');
}

function closePropertyPanel() {
  if (PropertyUI.panel) PropertyUI.panel.classList.remove('show');
}

function toggleRealEstate() {
  realEstateMode = !realEstateMode;
  if (PropertyUI.button) PropertyUI.button.classList.toggle('active', realEstateMode);

  if (realEstateMode) {
    loadPropertiesAtCurrentLocation();
  } else {
    closePropertyPanel();
    clearPropertyMarkers();
  }
}

async function loadPropertiesAtCurrentLocation() {
  const lat = LOC.lat - (car.z / SCALE);
  const lon = LOC.lon + (car.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

  // Check if we have any API keys configured
  const hasRealAPI = apiConfig.estated || apiConfig.attom || apiConfig.rentcast;
  const message = hasRealAPI ? 'Fetching real data...' : 'Fetching demo data...';

  showLoad(message);
  properties = await PropertyAPI.fetchProperties(lat, lon, 1) || [];
  hideLoad();

  if (properties.length > 0) {
    updatePropertyPanel();
    renderPropertyMarkers();

    // Count by source
    const sources = {};
    properties.forEach(p => {
      sources[p.source] = (sources[p.source] || 0) + 1;
    });

    const sourceStr = Object.entries(sources)
      .map(([src, count]) => `${count} ${src}`)
      .join(', ');

    // Debug log removed
  } else {
    console.warn('No properties loaded');
  }
}

function renderPropertyMarkers() {
  clearPropertyMarkers();

  properties.forEach(prop => {
    const pos = geoToWorld(prop.lat, prop.lon);

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
    scene.add(mesh);
    propMarkers.push(mesh);

    // Add price label on top
    const labelGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 0.5
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(pos.x, height + 1.5, pos.z);
    scene.add(label);
    propMarkers.push(label);

    // Add photo billboard if property has image
    if (prop.primaryPhoto) {
      // Create canvas to handle CORS issues with external images
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = function() {
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

          scene.add(billboard);
          propMarkers.push(billboard);
        } catch (e) {
          console.warn('Canvas rendering failed for:', prop.primaryPhoto, e);
        }
      };

      img.onerror = function() {
        // Fallback: try direct texture loading
        const loader = new THREE.TextureLoader();
        loader.crossOrigin = 'anonymous';

        loader.load(
          prop.primaryPhoto,
          function(texture) {
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

            scene.add(billboard);
            propMarkers.push(billboard);
          },
          undefined,
          function(error) {
            console.warn('Failed to load property image:', prop.primaryPhoto);
          }
        );
      };

      img.src = prop.primaryPhoto;
    }
  });
}

function clearPropertyMarkers() {
  propMarkers.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach(mat => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  propMarkers = [];
}

// ==================== HISTORIC SITES SYSTEM ====================

function toggleHistoric() {
  historicMode = !historicMode;
  const btn = document.getElementById('historicBtn');
  if (btn) btn.classList.toggle('active', historicMode);

  if (historicMode) {
    updateHistoricPanel();
  } else {
    closeHistoricPanel();
  }
}

function updateHistoricPanel() {
  const list = document.getElementById('historicList');
  if (!list) return;

  // Only show if historic mode is active
  if (!historicMode) return;

  // Calculate distances
  historicSites.forEach(site => {
    const dx = site.x - car.x;
    const dz = site.z - car.z;
    site.distance = Math.sqrt(dx * dx + dz * dz);
  });

  // Sort by distance
  historicSites.sort((a, b) => a.distance - b.distance);

  // Update count
  document.getElementById('historicCount').textContent = `${historicSites.length} Sites`;

  // Create cards
  list.innerHTML = historicSites.map(createHistoricCard).join('');
  document.getElementById('historicPanel').classList.add('show');
}

function createHistoricCard(site) {
  const distance = Math.round(site.distance);
  const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';
  const isSelected = selectedHistoric && selectedHistoric.name === site.name;

  return `
    <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer;transition:all 0.2s" onclick="openHistoricModal('${site.name}')">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
        <div style="font-size:16px;font-weight:700;color:#78350f;flex:1">${site.icon} ${site.name}</div>
        <div style="font-size:11px;color:#d97706;font-weight:600;background:#fff;padding:3px 6px;border-radius:4px">📍 ${distanceText}</div>
      </div>
      <div style="font-size:11px;color:#92400e;margin-bottom:8px">${site.category}</div>
      <button onclick="event.stopPropagation(); navigateToHistoric('${site.name}')" style="width:100%;background:${isSelected ? '#10b981' : '#f59e0b'};border:none;border-radius:6px;padding:6px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;font-size:11px;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Get Directions'}
      </button>
    </div>
  `;
}

async function openHistoricModal(siteName) {
  const site = historicSites.find(s => s.name === siteName);
  if (!site || !PropertyUI.modal) return;

  PropertyUI.modalTitle.textContent = site.name;

  let fact = 'Historic site with cultural significance.';

  // Try to get Wikipedia info if available
  if (site.wikidata) {
    try {
      const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${site.wikidata}.json`);
      if (response.ok) {
        const data = await response.json();
        const entity = data.entities[site.wikidata];
        if (entity && entity.descriptions && entity.descriptions.en) {
          fact = entity.descriptions.en.value;
        }
      }
    } catch (e) {
      console.warn('Could not fetch Wikidata info');
    }
  }

  const distance = Math.round(site.distance);
  const distanceText = distance > 1000 ? (distance/1000).toFixed(1) + 'km' : distance + 'm';
  const isSelected = selectedHistoric && selectedHistoric.name === site.name;

  const navButtons = `
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="navigateToHistoric('${site.name}')" style="flex:1;background:${isSelected ? '#10b981' : '#f59e0b'};border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">
        ${isSelected ? '✓ Navigating' : '🧭 Navigate Here'}
      </button>
      ${isSelected ? `<button onclick="clearNavigation()" style="flex:1;background:#ef4444;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;transition:all 0.2s">✕ Clear Route</button>` : ''}
    </div>
  `;

  PropertyUI.modalBody.innerHTML = `
    <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#78350f">
      <strong>⛩️ Historic Site</strong><br>
      ${fact}
    </div>
    <div style="width:100%;height:200px;background:#f5f5f5;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">
      ${site.icon}
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Type</span>
      <span class="prop-stat-value">${site.category}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Distance</span>
      <span class="prop-stat-value">${distanceText}</span>
    </div>
    <div class="prop-stat">
      <span class="prop-stat-label">Location</span>
      <span class="prop-stat-value">${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}</span>
    </div>
    ${navButtons}
    ${site.wikipedia ? `<button onclick="window.open('https://wikipedia.org/wiki/${site.wikipedia}','_blank')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">📖 Wikipedia</button>` : ''}
  `;
  PropertyUI.modal.classList.add('show');
}

function navigateToHistoric(siteName) {
  const site = historicSites.find(s => s.name === siteName);
  if (!site) return;

  selectedHistoric = site;
  selectedProperty = null; // Clear property navigation
  showNavigation = true;

  createNavigationRoute(car.x, car.z, site.x, site.z);
  updateHistoricPanel();
  closeModal();

  // Debug log removed
}

function closeHistoricPanel() {
  document.getElementById('historicPanel').classList.remove('show');
}

// Navigation system
function navigateToProperty(propertyId) {
  const prop = properties.find(p => p.id === propertyId);
  if (!prop) return;

  selectedProperty = prop;
  showNavigation = true;

  // Create navigation route - simple straight line for now
  createNavigationRoute(car.x, car.z, prop.x, prop.z);

  // Update UI
  updatePropertyPanel();
  closeModal();

  // Debug log removed
}

function clearNavigation() {
  selectedProperty = null;
  selectedHistoric = null;
  showNavigation = false;

  if (navigationRoute) {
    scene.remove(navigationRoute);
    navigationRoute = null;
  }

  if (navigationMarker) {
    scene.remove(navigationMarker);
    navigationMarker = null;
  }

  // Hide navigation HUD
  document.getElementById('navigationHud').style.display = 'none';

  updatePropertyPanel();
  if (historicMode) updateHistoricPanel();
  closeModal();
}

function createNavigationRoute(fromX, fromZ, toX, toZ) {
  // Remove old route and marker
  if (navigationRoute) {
    scene.remove(navigationRoute);
  }
  if (navigationMarker) {
    scene.remove(navigationMarker);
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

  navigationRoute = new THREE.Mesh(tubeGeometry, tubeMaterial);
  scene.add(navigationRoute);

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
  navigationMarker = markerGroup;
  scene.add(navigationMarker);

  // Animate marker (pulsing effect)
  const animateMarker = () => {
    if (navigationMarker && navigationMarker.parent) {
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

  if (showNavigation) {
    const destination = selectedProperty || selectedHistoric;
    if (destination) {
      // Get current position based on active mode
      let currentX, currentZ, currentAngle;

      if (droneMode) {
        // Drone mode
        currentX = drone.x;
        currentZ = drone.z;
        currentAngle = drone.yaw;
      } else if (Walk && Walk.state.mode === 'walk') {
        // Walking mode
        currentX = Walk.state.walker.x;
        currentZ = Walk.state.walker.z;
        currentAngle = Walk.state.walker.yaw;
      } else {
        // Driving mode
        currentX = car.x;
        currentZ = car.z;
        currentAngle = car.angle;
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
        selectedProperty ? selectedProperty.address.substring(0, 30) : selectedHistoric.name.substring(0, 30);

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
        const name = selectedProperty ? selectedProperty.address : selectedHistoric.name;
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
    if (!policeOn || police.length === 0) return;
    const mph = Math.abs(car.speed * 0.5);
    const limit = car.road?.limit || 25;
    const speeding = mph > limit;
    police.forEach(cop => {
        cop.siren += dt * 10;
        if (cop.cooldown > 0) cop.cooldown -= dt;
        const dx = car.x - cop.x, dz = car.z - cop.z, dist = Math.hypot(dx, dz);

        // Start chasing if speeding and within range
        if (speeding && dist < CFG.policeDist) cop.chasing = true;

        // REMOVED: Don't stop chasing when below speed limit - they keep chasing once started!
        // Only stop chasing if very far away (gave up the chase)
        if (dist > CFG.policeDist * 1.5) cop.chasing = false;

        if (cop.chasing) {
            const ta = Math.atan2(dx, dz);
            let ad = ta - cop.angle;
            while (ad > Math.PI) ad -= Math.PI * 2;
            while (ad < -Math.PI) ad += Math.PI * 2;
            cop.angle += ad * 4 * dt;
            if (dist > 50) cop.speed += CFG.policeAccel * dt;
            else cop.speed *= 0.95;
            cop.speed = Math.min(cop.speed, CFG.policeSpd);
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
            const nr = findNearestRoad(cnx, cnz);
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

        if (terrainEnabled) {
            let baseY = elevationWorldYAtWorldXZ(cop.x, cop.z);

            // Check if near road
            const nearRoad = findNearestRoad(cop.x, cop.z);

            if (nearRoad.dist < 20 && roadMeshes.length > 0) {
                // Near road - raycast against roads
                const raycaster = _getPhysRaycaster();
                _physRayStart.set(cop.x, 200, cop.z);
                raycaster.set(_physRayStart, _physRayDir);

                const roadHits = raycaster.intersectObjects(roadMeshes, false);

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
            policeHits++;
            cop.cooldown = 2;
            car.speed *= 0.3;
            cop.speed = 0;
            document.getElementById('police').textContent = '💔 ' + policeHits + '/3';
            if (policeHits >= 3) { paused = true; document.getElementById('caughtScreen').classList.add('show'); }
        }
    });
}

function spawnPolice() {
    policeMeshes.forEach(m => scene.remove(m)); policeMeshes = []; police = []; policeHits = 0;
    document.getElementById('police').textContent = '💔 0/3';
    for (let i = 0; i < 2; i++) {
        const mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.8 }));
        body.position.y = 0.5; body.castShadow = true; mesh.add(body);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.9 }));
        hood.position.set(0, 0.8, 0.7); mesh.add(hood);
        const sr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 })); // Reduced from 3
        sr.position.set(-0.3, 0.92, 0); mesh.add(sr);
        const sb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x0066ff, emissive: 0x0066ff, emissiveIntensity: 1.5 })); // Reduced from 3
        sb.position.set(0.3, 0.92, 0); mesh.add(sb);
        const ang = car.angle + Math.PI + (i === 0 ? 0.4 : -0.4);
        const dist = 50 + i * 20;
        const spawnX = car.x + Math.sin(ang) * dist;
        const spawnZ = car.z + Math.cos(ang) * dist;

        // Find surface at spawn position (should be on road since spawning behind player)
        let spawnY = 0;
        if (terrainEnabled && roadMeshes.length > 0) {
            const raycaster = _getPhysRaycaster();
            _physRayStart.set(spawnX, 200, spawnZ);
            raycaster.set(_physRayStart, _physRayDir);

            const roadHits = raycaster.intersectObjects(roadMeshes, false);

            if (roadHits.length > 0) {
                spawnY = roadHits[0].point.y;
            } else {
                // Fallback to terrain
                spawnY = elevationWorldYAtWorldXZ(spawnX, spawnZ);
            }
        }

        mesh.position.set(spawnX, spawnY, spawnZ);
        scene.add(mesh); policeMeshes.push(mesh);
        police.push({ mesh, x: spawnX, z: spawnZ, angle: car.angle, speed: 0, siren: i * Math.PI, chasing: false, cooldown: 0 });
    }
}

function clearPolice() {
    policeMeshes.forEach(m => {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
            if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
            } else {
                m.material.dispose();
            }
        }
    });
    policeMeshes = [];
    police = [];
}

function pickRoadPt() { if (roads.length === 0) return null; const rd = roads[Math.floor(Math.random() * roads.length)]; return rd.pts[Math.floor(Math.random() * rd.pts.length)]; }

function clearObjectives() {
    cpMeshes.forEach(m => {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
            if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
            } else {
                m.material.dispose();
            }
        }
    });
    cpMeshes = [];
    checkpoints = [];
    cpCollected = 0;
    if (destMesh) {
        scene.remove(destMesh);
        if (destMesh.geometry) destMesh.geometry.dispose();
        if (destMesh.material) {
            if (Array.isArray(destMesh.material)) {
                destMesh.material.forEach(mat => mat.dispose());
            } else {
                destMesh.material.dispose();
            }
        }
        destMesh = null;
    }
    destination = null;
    trialDone = false;
}

function spawnDest() {
    clearObjectives();
    let best = null;
    for (let i = 0; i < 40; i++) {
        const p = pickRoadPt(); if (!p) continue;
        const d = Math.hypot(p.x - car.x, p.z - car.z);
        if (d > 400 && d < 1200) { best = p; break; }
        if (!best || d > Math.hypot(best.x - car.x, best.z - car.z)) best = p;
    }
    if (!best) return;
    destination = { x: best.x, z: best.z };
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; grp.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 8), new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.3 }));
    beam.position.y = 20; grp.add(beam);
    grp.position.set(best.x, 0, best.z);
    scene.add(grp); destMesh = grp;
}

function spawnCheckpoints() {
    clearObjectives();
    for (let i = 0; i < 8; i++) {
        let p = null;
        for (let t = 0; t < 60; t++) {
            const c = pickRoadPt(); if (!c) continue;
            if (Math.hypot(c.x - car.x, c.z - car.z) < 250) continue;
            if (checkpoints.every(cp => Math.hypot(c.x - cp.x, c.z - cp.z) > 200)) { p = c; break; }
        }
        if (!p) p = pickRoadPt();
        if (!p) continue;
        checkpoints.push({ x: p.x, z: p.z, collected: false, idx: i + 1 });
        const grp = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.8, 8, 20), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; grp.add(ring);
        grp.position.set(p.x, 0, p.z);
        scene.add(grp); cpMeshes.push(grp);
    }
}

function startMode() { gameTimer = 0; clearObjectives(); if (gameMode === 'trial') spawnDest(); else if (gameMode === 'checkpoint') spawnCheckpoints(); }

function updateMode(dt) {
    if (gameMode === 'trial' || gameMode === 'checkpoint') gameTimer += dt;
    cpMeshes.forEach(m => m.rotation.y += dt * 1.5);
    if (destMesh) destMesh.rotation.y += dt * 1.2;
    if (gameMode === 'trial' && destination && !trialDone) {
        const d = Math.hypot(destination.x - car.x, destination.z - car.z);
        if (d < CFG.cpRadius) { trialDone = true; showResult('Destination Reached!', 'Time: ' + fmtTime(gameTimer)); }
        else if (gameTimer > CFG.trialTime) showResult("Time's Up!", 'Result: Failed');
    }
    if (gameMode === 'checkpoint') {
        for (let i = 0; i < checkpoints.length; i++) {
            const cp = checkpoints[i]; if (cp.collected) continue;
            if (Math.hypot(cp.x - car.x, cp.z - car.z) < CFG.cpRadius) {
                cp.collected = true; cpCollected++;
                if (cpMeshes[i]) cpMeshes[i].visible = false;
                if (cpCollected >= checkpoints.length) showResult('All Checkpoints!', 'Time: ' + fmtTime(gameTimer));
                break;
            }
        }
    }
}

function fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
function showResult(title, stats) { document.getElementById('resultTitle').textContent = title; document.getElementById('resultStats').innerHTML = stats; document.getElementById('resultScreen').classList.add('show'); paused = true; }
function hideResult() { document.getElementById('resultScreen').classList.remove('show'); }

Object.assign(globalThis, {
  clearNavigation,
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
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openModalById,
  pickRoadPt,
  renderPropertyMarkers,
  showMapInfo,
  showResult,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startMode,
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
  clearNavigation,
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
  navigateToHistoric,
  navigateToPOI,
  navigateToProperty,
  openModalById,
  pickRoadPt,
  renderPropertyMarkers,
  showMapInfo,
  showResult,
  spawnCheckpoints,
  spawnDest,
  spawnPolice,
  startMode,
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
};
