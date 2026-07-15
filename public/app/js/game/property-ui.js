import { ctx as appCtx } from "../shared-context.js?v=55";
import { clearNavigation, createNavigationRoute, describeDestinationEntrySupport, getNavigationTargetForDestination } from "./navigation-ui.js?v=1";
import { escapeHtml, escapeJsString, formatPrice, sanitizeHttpUrl, toFiniteNumber } from "./ui-utils.js?v=1";

export function createPropertyCard(property) {
  const safeId = escapeJsString(property.id);
  const safeAddress = escapeHtml(property.address || 'Address unavailable');
  const safePrice = toFiniteNumber(property.price, 0);
  const safeBeds = toFiniteNumber(property.beds, 0);
  const safeBaths = toFiniteNumber(property.baths, 0);
  const safeSqft = Math.round(toFiniteNumber(property.sqft, 0));
  const safeLat = toFiniteNumber(property.lat, 0);
  const safeLon = toFiniteNumber(property.lon, 0);
  const safePrimaryPhoto = sanitizeHttpUrl(property.primaryPhoto);

  let photoHTML;
  if (safePrimaryPhoto) {
    photoHTML = `<img src="${escapeHtml(safePrimaryPhoto)}" alt="${safeAddress}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${safeLat},${safeLon}&key=YOUR_API_KEY&source=outdoor'">`;
  } else {
    photoHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;color:white">
      <div style="font-size:48px;margin-bottom:8px">🏠</div>
      <div style="font-size:10px;opacity:0.8">Photo Unavailable</div>
    </div>`;
  }

  const sourceBadges = {
    demo: { color: '#fbbf24', text: 'DEMO', bgColor: '#fef3c7' },
    estated: { color: '#10b981', text: 'ESTATED', bgColor: '#d1fae5' },
    attom: { color: '#8b5cf6', text: 'ATTOM', bgColor: '#ede9fe' },
    rentcast: { color: '#3b82f6', text: 'RENTCAST', bgColor: '#dbeafe' }
  };
  const badge = sourceBadges[property.source] || sourceBadges.demo;
  const sourceTag = `<div style="position:absolute;top:6px;right:6px;background:${badge.bgColor};color:${badge.color};padding:3px 6px;border-radius:4px;font-size:9px;font-weight:700;border:1px solid ${badge.color}">${badge.text}</div>`;

  const isSelected = appCtx.selectedProperty && appCtx.selectedProperty.id === property.id;
  const distance = Math.round(toFiniteNumber(property.distance, 0));
  const distanceText = distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm';

  return `
  <div class="property-card" onclick="openModalById('${safeId}')" style="position:relative;margin-bottom:10px">
    <div class="prop-photo" style="height:140px">${photoHTML}${sourceTag}</div>
    <div class="prop-info">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
        <div class="prop-price" style="font-size:18px">${formatPrice(safePrice)}${property.priceType === 'rent' ? '/mo' : ''}</div>
        <div style="font-size:11px;color:#10b981;font-weight:600;background:#d1fae5;padding:3px 6px;border-radius:4px">📍 ${escapeHtml(distanceText)}</div>
      </div>
      <div class="prop-address" style="font-size:12px">${safeAddress}</div>
      <div class="prop-details" style="font-size:11px;gap:8px">🛏 ${safeBeds} 🚿 ${safeBaths} 📐 ${safeSqft}</div>
      <button onclick="event.stopPropagation(); navigateToProperty('${safeId}')" style="width:100%;background:${isSelected ? '#10b981' : '#667eea'};border:none;border-radius:6px;padding:6px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer;font-size:11px;margin-top:6px;transition:all 0.2s">${isSelected ? '✓ Navigating' : '🧭 Navigate'}</button>
    </div>
  </div>`;
}

export function updatePropertyPanel() {
  if (!appCtx.PropertyUI.list) return;

  appCtx.properties.forEach((property) => {
    const dx = property.x - appCtx.car.x;
    const dz = property.z - appCtx.car.z;
    property.distance = Math.sqrt(dx * dx + dz * dz);
  });

  const radiusMeters = appCtx.propertyRadius * 1000;
  let filtered = appCtx.properties.filter((property) => property.distance <= radiusMeters);
  if (appCtx.propertyTypeFilter !== 'all') {
    filtered = filtered.filter((property) => property.priceType === appCtx.propertyTypeFilter);
  }

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

  document.getElementById('propertyCount').textContent = `${filtered.length} Properties`;
  const sources = {};
  appCtx.properties.forEach((property) => {
    sources[property.source] = (sources[property.source] || 0) + 1;
  });
  document.getElementById('propertySource').textContent = Object.entries(sources).map(([key, count]) => `${count} ${key}`).join(', ');

  const hasRealData = appCtx.properties.some((property) => !property.isDemo && property.source !== 'demo');
  const primarySource = hasRealData
    ? appCtx.properties.find((property) => property.source === 'rentcast') ? 'RentCast (Live)'
      : appCtx.properties.find((property) => property.source === 'estated') ? 'Estated (Live)'
        : appCtx.properties.find((property) => property.source === 'attom') ? 'ATTOM (Live)'
          : 'Demo Data'
    : 'Demo Data';
  document.getElementById('dataSourceLabel').textContent = `Source: ${primarySource}`;

  appCtx.PropertyUI.list.innerHTML = filtered.map(createPropertyCard).join('');
  if (appCtx.PropertyUI.panel) appCtx.PropertyUI.panel.classList.add('show');
}

export function togglePropertyFilters() {
  const filters = document.getElementById('propertyFilters');
  const icon = document.getElementById('filterToggleIcon');
  if (!filters || !icon) return;
  const isHidden = filters.style.display === 'none';
  filters.style.display = isHidden ? 'block' : 'none';
  icon.textContent = isHidden ? '▲' : '▼';
}

export function openModalById(id) {
  const property = appCtx.properties.find((entry) => entry.id === id);
  if (!property || !appCtx.PropertyUI.modal) return;

  appCtx.PropertyUI.modalTitle.textContent = property.address || 'Property';
  const safeId = escapeJsString(property.id);
  const safePrice = toFiniteNumber(property.price, 0);
  const safeBeds = toFiniteNumber(property.beds, 0);
  const safeBaths = toFiniteNumber(property.baths, 0);
  const safeSqft = Math.round(toFiniteNumber(property.sqft, 0));
  const safePricePerSqft = toFiniteNumber(property.pricePerSqft, 0);
  const safePropertyType = escapeHtml(property.propertyType || 'Unknown');
  const safeYearBuilt = escapeHtml(property.yearBuilt || 'N/A');
  const safeDaysOnMarket = toFiniteNumber(property.daysOnMarket, 0);
  const safeSourceUrl = sanitizeHttpUrl(property.sourceUrl);
  const safePhotoUrls = Array.isArray(property.photos) ? property.photos.map(sanitizeHttpUrl).filter(Boolean).slice(0, 3) : [];
  const safePrimaryPhoto = sanitizeHttpUrl(property.primaryPhoto);
  const entrySupportText = describeDestinationEntrySupport(property);

  const photos = safePhotoUrls.length > 0
    ? safePhotoUrls.map((url) => `<img src="${escapeHtml(url)}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:100%;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'">`).join('')
    : safePrimaryPhoto
      ? `<img src="${escapeHtml(safePrimaryPhoto)}" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:100%;border-radius:12px;margin-bottom:16px" onerror="this.style.display='none'">`
      : `<div style="width:100%;height:200px;background:#f1f5f9;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;font-size:64px">🏠</div>`;

  const sourceNotices = {
    demo: { bg: '#fef3c7', border: '#fbbf24', color: '#78350f', icon: '⚠️', title: 'Demo Property', text: 'Simulated data for demonstration. Configure API keys in Settings for real listings.' },
    estated: { bg: '#d1fae5', border: '#10b981', color: '#065f46', icon: '✓', title: 'Estated Data', text: 'Property data from Estated API - comprehensive property records.' },
    attom: { bg: '#ede9fe', border: '#8b5cf6', color: '#5b21b6', icon: '✓', title: 'ATTOM Data', text: 'Premium property data from ATTOM Data Solutions.' },
    rentcast: { bg: '#dbeafe', border: '#3b82f6', color: '#1e3a8a', icon: '✓', title: 'RentCast Listing', text: 'Live property listing from RentCast API.' }
  };

  const notice = sourceNotices[property.source] || sourceNotices.demo;
  const sourceNotice = `<div style="background:${notice.bg};border:2px solid ${notice.border};border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:${notice.color}">
        <strong>${notice.icon} ${notice.title}</strong><br>
        ${notice.text}
       </div>`;
  const isSelected = appCtx.selectedProperty && appCtx.selectedProperty.id === property.id;
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
    <div class="prop-stat"><span class="prop-stat-label">Price</span><span class="prop-stat-value">${formatPrice(safePrice)}${property.priceType === 'rent' ? '/mo' : ''}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Bedrooms</span><span class="prop-stat-value">${safeBeds}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Bathrooms</span><span class="prop-stat-value">${safeBaths}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Square Feet</span><span class="prop-stat-value">${safeSqft.toLocaleString()}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Price per sqft</span><span class="prop-stat-value">${formatPrice(safePricePerSqft)}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Property Type</span><span class="prop-stat-value">${safePropertyType}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Year Built</span><span class="prop-stat-value">${safeYearBuilt}</span></div>
    <div class="prop-stat"><span class="prop-stat-label">Entry Support</span><span class="prop-stat-value">${escapeHtml(entrySupportText)}</span></div>
    ${safeDaysOnMarket > 0 ? `<div class="prop-stat"><span class="prop-stat-label">Days on Market</span><span class="prop-stat-value">${safeDaysOnMarket}</span></div>` : ''}
    ${navButtons}
    ${safeSourceUrl ? `<button onclick="window.open('${escapeJsString(safeSourceUrl)}','_blank','noopener,noreferrer')" style="width:100%;margin-top:8px;background:#64748b;border:none;border-radius:8px;padding:12px 24px;color:#ffffff;font-family:'Poppins',sans-serif;font-weight:600;cursor:pointer">🔗 View Full Listing</button>` : ''}
  `;
  appCtx.PropertyUI.modal.classList.add('show');
}

export function closeModal() {
  if (appCtx.PropertyUI.modal) appCtx.PropertyUI.modal.classList.remove('show');
}

export function closePropertyPanel() {
  if (appCtx.PropertyUI.panel) appCtx.PropertyUI.panel.classList.remove('show');
}

export function toggleRealEstate() {
  appCtx.realEstateMode = !appCtx.realEstateMode;
  if (appCtx.PropertyUI.button) appCtx.PropertyUI.button.classList.toggle('active', appCtx.realEstateMode);

  if (appCtx.realEstateMode) {
    loadPropertiesAtCurrentLocation();
  } else {
    closePropertyPanel();
    clearPropertyMarkers();
  }
}

export async function loadPropertiesAtCurrentLocation() {
  const lat = appCtx.LOC.lat - appCtx.car.z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + appCtx.car.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  const hasRealAPI = appCtx.apiConfig.estated || appCtx.apiConfig.attom || appCtx.apiConfig.rentcast;
  appCtx.showLoad(hasRealAPI ? 'Fetching real data...' : 'Fetching demo data...');
  appCtx.properties = (await appCtx.PropertyAPI.fetchProperties(lat, lon, 1)) || [];
  appCtx.hideLoad();

  if (appCtx.properties.length > 0) {
    updatePropertyPanel();
    renderPropertyMarkers();
  } else {
    console.warn('No properties loaded');
  }
}

export function renderPropertyMarkers() {
  clearPropertyMarkers();

  appCtx.properties.forEach((property) => {
    const pos = appCtx.geoToWorld(property.lat, property.lon);
    const height = Math.log10(property.price) * 2;
    const color = property.priceType === 'sale' ? 0x10b981 : 0x3b82f6;

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, height, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
    );
    mesh.position.set(pos.x, height / 2, pos.z);
    mesh.castShadow = true;
    appCtx.scene.add(mesh);
    appCtx.propMarkers.push(mesh);

    const label = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.5 })
    );
    label.position.set(pos.x, height + 1.5, pos.z);
    appCtx.scene.add(label);
    appCtx.propMarkers.push(label);

    if (!property.primaryPhoto) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const canvasCtx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        canvasCtx.drawImage(img, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const billboardHeight = 10;
        const aspectRatio = img.width / img.height;
        const billboard = new THREE.Mesh(
          new THREE.PlaneGeometry(billboardHeight * aspectRatio, billboardHeight),
          new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: false })
        );
        billboard.position.set(pos.x, height + 8, pos.z);
        billboard.userData.isBillboard = true;
        billboard.userData.propertyId = property.id;
        appCtx.scene.add(billboard);
        appCtx.propMarkers.push(billboard);
      } catch (error) {
        console.warn('Canvas rendering failed for:', property.primaryPhoto, error);
      }
    };

    img.onerror = function () {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(
        property.primaryPhoto,
        (texture) => {
          const billboardHeight = 10;
          const aspectRatio = texture.image.width / texture.image.height;
          const billboard = new THREE.Mesh(
            new THREE.PlaneGeometry(billboardHeight * aspectRatio, billboardHeight),
            new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
          );
          billboard.position.set(pos.x, height + 8, pos.z);
          billboard.userData.isBillboard = true;
          billboard.userData.propertyId = property.id;
          appCtx.scene.add(billboard);
          appCtx.propMarkers.push(billboard);
        },
        undefined,
        () => {
          console.warn('Failed to load property image:', property.primaryPhoto);
        }
      );
    };

    img.src = property.primaryPhoto;
  });
}

export function clearPropertyMarkers() {
  appCtx.propMarkers.forEach((marker) => {
    appCtx.scene.remove(marker);
    if (marker.geometry) marker.geometry.dispose();
    if (marker.material) {
      if (Array.isArray(marker.material)) marker.material.forEach((mat) => mat.dispose());
      else marker.material.dispose();
    }
  });
  appCtx.propMarkers = [];
}

export function navigateToProperty(propertyId) {
  const property = appCtx.properties.find((entry) => entry.id === propertyId);
  if (!property) return;

  appCtx.selectedProperty = property;
  appCtx.showNavigation = true;

  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const target = getNavigationTargetForDestination(property);
  createNavigationRoute(ref.x, ref.z, target.x, target.z, true);

  updatePropertyPanel();
  closeModal();
}
