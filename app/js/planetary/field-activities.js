import { getAstronomicalBody } from '../astronomy/body-catalog.js?v=3';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { createIndexedDbDiscoveryProfileStore } from '../discovery/profile-store.js?v=4';

const INTERACTION_RADIUS = 18;
const ACTIVITY_OFFSETS = Object.freeze([
  Object.freeze({ x: 12, z: -8 }),
  Object.freeze({ x: -44, z: 18 }),
  Object.freeze({ x: 16, z: 58 })
]);
const FIELD_PROCEDURES = Object.freeze({
  photograph: Object.freeze(['Deploy panorama stabilizers', 'Calibrate the panorama sweep', 'Capture the panorama']),
  'geology-inspect': Object.freeze(['Scan the exposed material', 'Select a representative fragment', 'Seal the sample case']),
  'habitat-survey': Object.freeze(['Level the sampling plate', 'Calibrate the sensor mast', 'Record the environment'])
});

const BODY_FIELD_NOTES = Object.freeze({
  mercury: Object.freeze([
    ['Photograph Caloris terrain', 'photograph', 'places', 'Record the modeled basin terrain in MESSENGER enhanced-color context.'],
    ['Inspect surface material', 'geology-inspect', 'rock', 'Inspect a virtual rocky-surface record informed by MESSENGER observations.'],
    ['Survey the thermal environment', 'habitat-survey', 'places', 'Log the airless surface conditions without implying a live local measurement.']
  ]),
  venus: Object.freeze([
    ['Record radar terrain context', 'photograph', 'places', 'Document the modeled Maxwell Montes terrain in Magellan radar context.'],
    ['Inspect volcanic-rock context', 'geology-inspect', 'rock', 'Inspect a virtual surface record informed by Magellan observations.'],
    ['Survey pressure and heat', 'habitat-survey', 'places', 'Log the shared Venus environment model from the protected crawler.']
  ]),
  io: Object.freeze([
    ['Document volcanic terrain', 'photograph', 'places', 'Record the modeled volcanic landform and its Voyager/Galileo image context.'],
    ['Inspect sulfurous surface', 'geology-inspect', 'mineral', 'Inspect a virtual surface sample informed by known Io composition.'],
    ['Complete radiation survey', 'habitat-survey', 'places', 'Log the hazardous surface environment without claiming a live eruption nearby.']
  ]),
  europa: Object.freeze([
    ['Photograph crossing lineae', 'photograph', 'places', 'Record the modeled fracture pattern and its Voyager/Galileo image context.'],
    ['Inspect water-ice surface', 'geology-inspect', 'mineral', 'Inspect a virtual ice-surface sample; subsurface conditions remain uncertain.'],
    ['Map chaos terrain', 'habitat-survey', 'places', 'Log the shape of the modeled local chaos terrain.']
  ]),
  titan: Object.freeze([
    ['Photograph dune terrain', 'photograph', 'places', 'Record the modeled dune field through Titan haze.'],
    ['Inspect organic-rich surface', 'geology-inspect', 'sediment', 'Inspect a virtual surface record informed by Cassini observations.'],
    ['Measure haze visibility', 'habitat-survey', 'places', 'Log visibility and pressure from the shared Titan environment model.']
  ]),
  enceladus: Object.freeze([
    ['Photograph ice fractures', 'photograph', 'places', 'Record modeled south-polar fractures in Cassini image context.'],
    ['Inspect fresh ice context', 'geology-inspect', 'mineral', 'Inspect a virtual ice-surface record without claiming a plume is active here.'],
    ['Map fracture spacing', 'habitat-survey', 'places', 'Log the local modeled fracture pattern.']
  ]),
  triton: Object.freeze([
    ['Photograph cellular terrain', 'photograph', 'places', 'Record modeled cantaloupe terrain within the Voyager-imaged hemisphere.'],
    ['Inspect nitrogen-ice context', 'geology-inspect', 'mineral', 'Inspect a virtual cold-surface record informed by Voyager evidence.'],
    ['Survey the thin atmosphere', 'habitat-survey', 'places', 'Log the near-vacuum environment without claiming present geyser activity.']
  ]),
  ceres: Object.freeze([
    ['Photograph Occator terrain', 'photograph', 'places', 'Record modeled crater relief in Dawn enhanced-color context.'],
    ['Inspect bright-material context', 'geology-inspect', 'mineral', 'Inspect a virtual surface record informed by Dawn observations of bright deposits.'],
    ['Map crater relief', 'habitat-survey', 'places', 'Log the local modeled crater profile.']
  ]),
  vesta: Object.freeze([
    ['Photograph basin terrain', 'photograph', 'places', 'Record modeled Rheasilvia relief in Dawn image context.'],
    ['Inspect basaltic surface', 'geology-inspect', 'rock', 'Inspect a virtual rocky-surface record informed by Dawn mission context.'],
    ['Survey impact structure', 'habitat-survey', 'places', 'Log the local modeled basin profile.']
  ]),
  pluto: Object.freeze([
    ['Photograph nitrogen-ice cells', 'photograph', 'places', 'Record modeled Sputnik Planitia cells in New Horizons color context.'],
    ['Inspect water-ice mountain context', 'geology-inspect', 'mineral', 'Inspect a virtual cold-surface record informed by New Horizons observations.'],
    ['Survey the thin atmosphere', 'habitat-survey', 'places', 'Log the near-vacuum environment and distant sunlight.']
  ])
});

let active = null;
let profileStore = null;
let mapTimer = 0;
let planetaryJournalOpen = false;
let planetaryJournalBound = false;
let planetaryJournalSection = 'journal';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function selectPlanetaryJournalSection(section = 'journal') {
  planetaryJournalSection = section === 'guide' ? 'guide' : 'journal';
  document.querySelectorAll('[data-discovery-tab]').forEach((tab) => {
    const selected = tab.dataset.discoveryTab === planetaryJournalSection;
    tab.classList.toggle('active', selected);
    tab.hidden = !['journal', 'guide'].includes(tab.dataset.discoveryTab);
  });
  document.querySelectorAll('[data-discovery-pane]').forEach((pane) => {
    pane.classList.toggle('active', pane.dataset.discoveryPane === planetaryJournalSection);
  });
}

function closePlanetaryJournal() {
  if (!planetaryJournalOpen) return false;
  planetaryJournalOpen = false;
  const panel = document.getElementById('discoveryPanel');
  panel?.classList.remove('show');
  panel?.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('[data-discovery-tab]').forEach((tab) => {
    tab.hidden = false;
  });
  document.getElementById('solidWorldPanel')?.style.removeProperty('visibility');
  document.getElementById('solidWorldReturnBtn')?.style.removeProperty('visibility');
  appCtx.screenLayout?.setPanelLayer?.('journal', false);
  return true;
}

async function refreshPlanetaryJournal() {
  if (!planetaryJournalOpen) return false;
  profileStore ||= appCtx.discoveryProfileStore || createIndexedDbDiscoveryProfileStore();
  appCtx.discoveryProfileStore ||= profileStore;
  const [events, guide] = await Promise.all([
    profileStore.listEvents?.(100).catch(() => []) || [],
    profileStore.listFieldGuide?.(200).catch(() => []) || []
  ]);
  const journalList = document.getElementById('discoveryJournalList');
  const guideList = document.getElementById('discoveryFieldGuideList');
  const guideOverview = document.getElementById('discoveryGuideOverview');
  const regionFilter = document.getElementById('discoveryJournalRegion');
  const categoryFilter = document.getElementById('discoveryJournalCategory');
  if (regionFilter) {
    const selected = regionFilter.value || 'all';
    const regions = [...new Map(events.filter((event) => event.regionId).map((event) => [event.regionId, event.regionLabel || event.regionId])).entries()];
    regionFilter.innerHTML = `<option value="all">All regions</option>${regions.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('')}`;
    regionFilter.value = regions.some(([id]) => id === selected) ? selected : 'all';
  }
  const category = categoryFilter?.value || 'all';
  const region = regionFilter?.value || 'all';
  const filteredEvents = events.filter((event) =>
    (category === 'all' || (event.pathId || 'field') === category) &&
    (region === 'all' || event.regionId === region)
  );
  if (journalList) journalList.innerHTML = filteredEvents.length
    ? filteredEvents.slice(0, 24).map((event) => {
        const when = new Date(Number(event.occurredAt || event.collectedAt) || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return `<article class="discoveryItem discoveryJournalEvent"><span class="discoveryJournalTime">${escapeHtml(when)}</span><span class="discoveryJournalPath">Fieldwork</span><strong>${escapeHtml(event.name || 'Planetary field record')}</strong><small>${escapeHtml(event.regionLabel || event.regionId || 'Planetary surface')} · ${escapeHtml(event.activityId || 'field record')}</small><span class="discoveryJournalProgress">Saved to your Journal</span></article>`;
      }).join('')
    : '<div class="discoveryEmpty">No Journal records match these filters.</div>';
  if (guideList) guideList.innerHTML = guide.length
    ? guide.slice(0, 40).map((entry) => `<article class="discoveryItem"><strong>${escapeHtml(entry.name || entry.catalogId || 'Field Guide record')}</strong><small>${escapeHtml(entry.family || 'planetary fieldwork')} · ${Number(entry.observations || 1)} observation${Number(entry.observations || 1) === 1 ? '' : 's'}</small></article>`).join('')
    : '<div class="discoveryEmpty">Document a field point to begin your Field Guide.</div>';
  if (guideOverview) guideOverview.innerHTML = `<article><strong>${guide.length}</strong><span>identified</span></article><article><strong>${events.length}</strong><span>Journal records</span></article><article><strong>World</strong><span>Guide scope</span></article>`;
  return true;
}

async function openPlanetaryJournal(section = 'journal') {
  if (!appCtx.activePlanetaryBodyId) return false;
  const panel = document.getElementById('discoveryPanel');
  if (!panel) return false;
  if (!planetaryJournalBound) {
    planetaryJournalBound = true;
    document.getElementById('discoveryCloseBtn')?.addEventListener('click', () => {
      if (appCtx.activePlanetaryBodyId) closePlanetaryJournal();
    });
    document.getElementById('discoveryJournalCategory')?.addEventListener('change', () => void refreshPlanetaryJournal());
    document.getElementById('discoveryJournalRegion')?.addEventListener('change', () => void refreshPlanetaryJournal());
    document.querySelectorAll('[data-discovery-tab="journal"], [data-discovery-tab="guide"]').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!appCtx.activePlanetaryBodyId) return;
        selectPlanetaryJournalSection(tab.dataset.discoveryTab);
        void refreshPlanetaryJournal();
      });
    });
  }
  planetaryJournalOpen = true;
  document.getElementById('discoveryPanelTitle').textContent = `${getAstronomicalBody(appCtx.activePlanetaryBodyId)?.name || 'Planetary'} Explorer`;
  selectPlanetaryJournalSection(section);
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('solidWorldPanel')?.style.setProperty('visibility', 'hidden');
  document.getElementById('solidWorldReturnBtn')?.style.setProperty('visibility', 'hidden');
  appCtx.screenLayout?.setPanelLayer?.('journal', true);
  await refreshPlanetaryJournal();
  return true;
}

function playerPosition() {
  const walker = appCtx.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : null;
  return walker || appCtx.car || null;
}

function closestActivity(maxDistance = Infinity) {
  const player = playerPosition();
  if (!active || !player) return null;
  let nearest = null;
  active.activities.forEach((activity) => {
    const distance = Math.hypot(activity.x - Number(player.x || 0), activity.z - Number(player.z || 0));
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) nearest = { ...activity, distance };
  });
  return nearest;
}

function nearestActivity() {
  return closestActivity(INTERACTION_RADIUS);
}

function fieldMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.28,
    roughness: options.roughness ?? 0.52,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true
  });
}

function addFieldMesh(group, geometry, material, name, position, rotation = null) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = material.transparent !== true;
  object.receiveShadow = material.transparent !== true;
  group.add(object);
  return object;
}

function addFieldBrace(group, start, end, radius, material, name) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const object = addFieldMesh(
    group,
    new THREE.CylinderGeometry(radius, radius, direction.length(), 10),
    material,
    name,
    [0, 0, 0]
  );
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function addPhotographySite(group, materials) {
  const hub = new THREE.Vector3(0, 1.45, 0);
  [[-0.85, 0, -0.62], [0.85, 0, -0.62], [0, 0, 0.92]].forEach((foot, index) => {
    addFieldBrace(group, hub, new THREE.Vector3(...foot), 0.055, materials.frame, `panorama-tripod-leg-${index + 1}`);
    addFieldMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), materials.frame, `panorama-tripod-foot-${index + 1}`, [foot[0], 0.04, foot[2]]);
  });
  addFieldMesh(group, new THREE.CylinderGeometry(0.12, 0.17, 0.36, 16), materials.frame, 'panorama-gimbal', [0, 1.56, 0]);
  addFieldMesh(group, new THREE.BoxGeometry(0.92, 0.5, 0.48), materials.shell, 'panorama-camera-body', [0, 1.86, 0]);
  addFieldMesh(group, new THREE.CylinderGeometry(0.23, 0.31, 0.5, 20), materials.dark, 'panorama-camera-lens', [0, 1.87, -0.48], [Math.PI / 2, 0, 0]);
  addFieldMesh(group, new THREE.CylinderGeometry(0.14, 0.2, 0.08, 20), materials.glass, 'panorama-camera-glass', [0, 1.87, -0.75], [Math.PI / 2, 0, 0]);
  addFieldMesh(group, new THREE.BoxGeometry(0.44, 0.24, 0.05), materials.screen, 'panorama-camera-display', [0, 1.86, 0.265]);
  const sweep = addFieldMesh(group, new THREE.TorusGeometry(2.1, 0.035, 8, 48, Math.PI * 1.55), materials.guide, 'panorama-sweep-guide', [0, 0.08, 0]);
  sweep.rotation.x = Math.PI / 2;
  sweep.rotation.z = -Math.PI * 0.77;
}

function addGeologySite(group, materials) {
  const rockMaterial = fieldMaterial(0x695246, { metalness: 0.04, roughness: 0.96 });
  const mineralMaterial = fieldMaterial(0xb8834d, { metalness: 0.18, roughness: 0.7 });
  const rockLayout = [
    [-1.1, 0.34, -0.15, 0.62, 0.38], [-0.55, 0.48, -0.35, 0.82, -0.22], [0.12, 0.55, -0.28, 0.92, 0.17],
    [0.78, 0.42, -0.18, 0.7, -0.3], [1.18, 0.25, 0.02, 0.48, 0.12], [-0.28, 0.27, 0.32, 0.5, 0.44]
  ];
  rockLayout.forEach(([x, y, z, scale, turn], index) => {
    const rock = addFieldMesh(group, new THREE.DodecahedronGeometry(0.72, 1), index === 2 ? mineralMaterial : rockMaterial, `geology-outcrop-${index + 1}`, [x, y, z], [0.12 * index, turn, -0.08 * index]);
    rock.scale.set(scale * 1.3, scale * 0.72, scale);
  });
  addFieldMesh(group, new THREE.BoxGeometry(1.7, 0.16, 1.05), materials.dark, 'sample-case-base', [0.45, 0.13, 1.45]);
  const lid = addFieldMesh(group, new THREE.BoxGeometry(1.7, 0.12, 1.05), materials.shell, 'sample-case-lid', [0.45, 0.82, 1.88], [-0.82, 0, 0]);
  lid.userData.fieldActionPart = 'sample-case-lid';
  [-0.08, 0.36, 0.8].forEach((x, index) => {
    addFieldMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16), index === 1 ? mineralMaterial : rockMaterial, `sealed-sample-slot-${index + 1}`, [x, 0.28, 1.42]);
  });
  addFieldBrace(group, new THREE.Vector3(-1.55, 0.05, 1.22), new THREE.Vector3(-1.25, 1.42, 0.94), 0.06, materials.frame, 'sample-scanner-support-port');
  addFieldBrace(group, new THREE.Vector3(1.55, 0.05, 1.22), new THREE.Vector3(1.25, 1.42, 0.94), 0.06, materials.frame, 'sample-scanner-support-starboard');
  addFieldBrace(group, new THREE.Vector3(-1.25, 1.42, 0.94), new THREE.Vector3(1.25, 1.42, 0.94), 0.08, materials.frame, 'sample-scanner-crossbar');
  addFieldMesh(group, new THREE.BoxGeometry(0.62, 0.24, 0.38), materials.shell, 'sample-scanner-head', [0, 1.34, 0.94]);
  addFieldMesh(group, new THREE.CylinderGeometry(0.06, 0.23, 1.28, 18, 1, true), materials.beam, 'sample-scanner-field', [0, 0.72, 0.78]);
}

function addHabitatSite(group, materials) {
  const mast = addFieldMesh(group, new THREE.CylinderGeometry(0.08, 0.11, 3.2, 12), materials.frame, 'environment-mast', [0, 1.6, 0]);
  mast.userData.fieldActionPart = 'environment-mast';
  [[-1.1, 0, -0.72], [1.1, 0, -0.72], [0, 0, 1.2]].forEach((foot, index) => {
    addFieldBrace(group, new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(...foot), 0.045, materials.frame, `environment-mast-brace-${index + 1}`);
    addFieldMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.07, 14), materials.dark, `environment-mast-foot-${index + 1}`, [foot[0], 0.035, foot[2]]);
  });
  addFieldMesh(group, new THREE.BoxGeometry(0.88, 0.62, 0.46), materials.shell, 'environment-control-box', [0, 1.48, 0.12]);
  addFieldMesh(group, new THREE.BoxGeometry(0.56, 0.28, 0.04), materials.screen, 'environment-control-display', [0, 1.51, -0.125]);
  addFieldMesh(group, new THREE.CylinderGeometry(0.22, 0.32, 0.48, 18), materials.shell, 'environment-sensor-head', [0, 3.35, 0]);
  addFieldMesh(group, new THREE.SphereGeometry(0.19, 16, 10), materials.glass, 'environment-optical-sensor', [0, 3.58, -0.18]);
  const crossbar = addFieldBrace(group, new THREE.Vector3(-0.72, 3.15, 0), new THREE.Vector3(0.72, 3.15, 0), 0.035, materials.frame, 'environment-anemometer-crossbar');
  crossbar.userData.fieldActionPart = 'anemometer';
  [-0.72, 0.72].forEach((x, index) => {
    addFieldMesh(group, new THREE.SphereGeometry(0.16, 12, 8), materials.shell, `environment-anemometer-cup-${index + 1}`, [x, 3.15, index ? 0.16 : -0.16]);
  });
  const plate = addFieldMesh(group, new THREE.CylinderGeometry(0.95, 0.95, 0.06, 24), materials.dark, 'environment-sampling-plate', [1.85, 0.05, 0.55]);
  plate.scale.z = 0.62;
  addFieldMesh(group, new THREE.TorusGeometry(0.58, 0.035, 8, 28), materials.guide, 'environment-sampling-zone', [1.85, 0.1, 0.55], [Math.PI / 2, 0, 0]);
}

function markerFor(activity) {
  const group = new THREE.Group();
  group.name = `${activity.bodyId} ${activity.activityId} field site`;
  const color = activity.activityId === 'photograph' ? 0x6fd5ff : activity.activityId === 'geology-inspect' ? 0xffc866 : 0x83e6a6;
  const materials = Object.freeze({
    shell: fieldMaterial(0xaab9c2, { metalness: 0.58, roughness: 0.32 }),
    frame: fieldMaterial(0x1b2b35, { metalness: 0.74, roughness: 0.26 }),
    dark: fieldMaterial(0x151b20, { metalness: 0.34, roughness: 0.66 }),
    glass: fieldMaterial(0x5ecfff, { metalness: 0.08, roughness: 0.12, emissive: 0x165c79, emissiveIntensity: 0.72 }),
    screen: fieldMaterial(color, { metalness: 0.08, roughness: 0.2, emissive: color, emissiveIntensity: 0.56 }),
    guide: fieldMaterial(color, { metalness: 0.02, roughness: 0.25, emissive: color, emissiveIntensity: 0.72, transparent: true, opacity: 0.72, depthWrite: false }),
    beam: fieldMaterial(color, { metalness: 0, roughness: 0.35, emissive: color, emissiveIntensity: 0.38, transparent: true, opacity: 0.16, depthWrite: false })
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.055, 8, 40),
    materials.guide
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  ring.name = `${activity.activityId}-work-zone`;
  group.add(ring);
  addFieldMesh(group, new THREE.CylinderGeometry(0.34, 0.42, 0.18, 18), materials.frame, `${activity.activityId}-status-base`, [-2.15, 0.09, 1.85]);
  addFieldMesh(group, new THREE.CylinderGeometry(0.12, 0.18, 0.18, 18), materials.screen, `${activity.activityId}-status-light`, [-2.15, 0.28, 1.85]);
  if (activity.activityId === 'photograph') addPhotographySite(group, materials);
  else if (activity.activityId === 'geology-inspect') addGeologySite(group, materials);
  else addHabitatSite(group, materials);
  group.position.set(activity.x, activity.y + 0.08, activity.z);
  group.userData.truthClass = 'generated_game_detail';
  group.userData.planetaryFieldActivityId = activity.id;
  group.userData.activityStep = 0;
  group.userData.presentation = activity.activityId === 'photograph'
    ? 'panorama-imaging-station'
    : activity.activityId === 'geology-inspect'
      ? 'sample-analysis-site'
      : 'environment-monitoring-station';
  return group;
}

function fieldSite(activity) {
  return active?.sites?.get?.(activity?.id) || null;
}

function procedureState(activity) {
  const steps = FIELD_PROCEDURES[activity?.activityId] || Object.freeze([activity?.label || 'Record field point']);
  const site = fieldSite(activity);
  const step = Math.max(0, Math.min(steps.length, Number(site?.userData?.activityStep || 0)));
  return Object.freeze({ steps, step, complete: step >= steps.length, label: step >= steps.length ? `Review ${activity.label}` : steps[step] });
}

function updateFieldSitePresentation(activity, step) {
  const site = fieldSite(activity);
  if (!site) return;
  site.userData.activityStep = step;
  site.traverse((object) => {
    if (!object.isMesh) return;
    if (object.name.endsWith('-status-light') && object.material) object.material.emissiveIntensity = step >= 3 ? 1.15 : 0.5 + step * 0.2;
    if (object.name === 'sample-scanner-field') object.visible = step > 0 && step < 3;
    if (object.name === 'sample-case-lid') {
      object.rotation.x = step >= 3 ? -0.05 : -0.82;
      object.position.y = step >= 3 ? 0.69 : 0.82;
      object.position.z = step >= 3 ? 1.48 : 1.88;
    }
    if (object.name === 'panorama-sweep-guide') object.rotation.z = -Math.PI * 0.77 + step * 0.42;
    if (object.name === 'environment-anemometer-crossbar') object.rotation.y = step * Math.PI * 0.68;
  });
}

function activatePlanetaryFieldActivities(pack, world, sampleHeight) {
  const definitions = pack?.fieldNotes || BODY_FIELD_NOTES[pack?.bodyId];
  if (!definitions || !world || typeof sampleHeight !== 'function') {
    active = null;
    return Object.freeze([]);
  }
  if (!world.fieldActivities) {
    world.fieldActivitySites = new Map();
    world.fieldActivities = definitions.map((definition, index) => {
      const [label, activityId, family, description] = definition;
      const offset = ACTIVITY_OFFSETS[index];
      const x = pack.spawn.x + offset.x;
      const z = pack.spawn.z + offset.z;
      const y = pack.manifest.renderPlacement.y + sampleHeight(x, z);
      const activity = Object.freeze({
        id: `${pack.bodyId}:${pack.manifest.regionId}:${activityId}`,
        bodyId: pack.bodyId,
        regionId: pack.manifest.regionId,
        label,
        activityId,
        family,
        description,
        x,
        y,
        z
      });
      const marker = markerFor(activity);
      world.fieldActivitySites.set(activity.id, marker);
      world.objects.push(marker);
      appCtx.scene.add(marker);
      return activity;
    });
  }
  active = Object.freeze({
    bodyId: pack.bodyId,
    bodyName: pack.bodyName || getAstronomicalBody(pack.bodyId)?.name || pack.bodyId,
    regionId: pack.manifest.regionId,
    center: Object.freeze({ x: pack.spawn.x, z: pack.spawn.z }),
    activities: world.fieldActivities,
    sites: world.fieldActivitySites || new Map()
  });
  return Object.freeze([...world.fieldActivities]);
}

function clearPlanetaryFieldActivities() {
  active = null;
  mapTimer = 0;
  closePlanetaryJournal();
}

function updatePlanetaryFieldMap(dt = 0) {
  if (!active) return;
  mapTimer -= Math.max(0, Number(dt) || 0);
  if (mapTimer > 0) return;
  mapTimer = 0.15;
  const canvas = document.getElementById('planetaryFieldMap');
  const hint = document.getElementById('planetaryFieldHint');
  const context = canvas?.getContext?.('2d');
  const player = playerPosition();
  if (!canvas || !context || !player) return;
  const width = canvas.width;
  const height = canvas.height;
  const rangeM = 110;
  const px = (x) => width / 2 + (x - active.center.x) / rangeM * (width * 0.44);
  const py = (z) => height / 2 + (z - active.center.z) / rangeM * (height * 0.44);
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(4,8,14,.86)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(148,163,184,.18)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 4) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y <= height; y += height / 4) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  active.activities.forEach((activity) => {
    context.fillStyle = activity.activityId === 'photograph' ? '#6fd5ff' : activity.activityId === 'geology-inspect' ? '#ffc866' : '#83e6a6';
    context.beginPath(); context.arc(px(activity.x), py(activity.z), 4, 0, Math.PI * 2); context.fill();
  });
  context.save();
  context.translate(px(Number(player.x) || 0), py(Number(player.z) || 0));
  context.rotate(-(Number(appCtx.car?.angle) || 0));
  context.fillStyle = '#ffffff';
  context.beginPath(); context.moveTo(0, -6); context.lineTo(4, 5); context.lineTo(-4, 5); context.closePath(); context.fill();
  context.restore();
  const nearby = nearestActivity();
  const closest = nearby || closestActivity();
  const nearbyProcedure = nearby ? procedureState(nearby) : null;
  if (hint) hint.textContent = nearby
    ? `${nearbyProcedure.label} · ${Math.round(nearby.distance)} m · use E or Explore`
    : closest
      ? `Nearest: ${closest.label} · ${Math.round(closest.distance)} m`
      : 'Blue: photo · gold: surface · green: environment';
}

async function recordActivity(activity) {
  const body = getAstronomicalBody(activity.bodyId);
  const bodyName = body?.name || active?.bodyName || activity.bodyId;
  profileStore ||= appCtx.discoveryProfileStore || createIndexedDbDiscoveryProfileStore();
  const result = await profileStore.recordObservation({
    claimId: `planetary-field:${activity.id}`,
    catalogId: `planetary-${activity.bodyId}-${activity.activityId}`,
    name: activity.label,
    family: activity.family,
    discipline: activity.family === 'places' ? 'exploration' : 'earth-science',
    activityId: activity.activityId,
    evidenceClass: 'virtual-planetary-field-record',
    evidenceContractId: 'planetary-modeled-surface-v1',
    evidencePayload: {
      observedImageContext: true,
      modeledLocalRelief: true,
      livePresenceClaim: false,
      bodyId: activity.bodyId,
      surfaceRegionId: activity.regionId
    },
    regionId: activity.regionId,
    regionLabel: body ? `${body.presentation.surfaceLabel}, ${body.name}` : `${activity.regionId}, ${bodyName}`,
    worldIdentity: `${activity.bodyId}:${activity.regionId}`,
    locationKey: `${activity.bodyId}:${activity.regionId}`,
    localPosition: { x: activity.x, y: activity.y, z: activity.z },
    environment: 'PLANETARY',
    description: activity.description,
    collectedAt: Date.now()
  }, { collection: false });
  const message = result.recorded
    ? `${activity.label.toUpperCase()} · SAVED TO JOURNAL`
    : `${activity.label.toUpperCase()} · ALREADY DOCUMENTED`;
  appCtx.showSpaceFlightMessage?.(message, result.recorded ? '#83e6a6' : '#8ab4ff');
  if (activity.activityId === 'geology-inspect') {
    appCtx.collectExpeditionGeologySample?.(activity);
  }
  globalThis.dispatchEvent?.(new CustomEvent('we3d:planetary-field-recorded', { detail: { activity, result } }));
  if (planetaryJournalOpen) void refreshPlanetaryJournal();
  return true;
}

async function advanceActivity(activity) {
  const procedure = procedureState(activity);
  if (procedure.complete) return recordActivity(activity);
  const nextStep = procedure.step + 1;
  updateFieldSitePresentation(activity, nextStep);
  if (nextStep < procedure.steps.length) {
    appCtx.showSpaceFlightMessage?.(`${procedure.steps[procedure.step].toUpperCase()} · ${nextStep} OF ${procedure.steps.length}`, '#8ab4ff');
    globalThis.dispatchEvent?.(new CustomEvent('we3d:planetary-field-step', { detail: { activity, step: nextStep, total: procedure.steps.length } }));
    return true;
  }
  return recordActivity(activity);
}

appCtx.registerContextInteraction?.({
  id: 'planetary-field-activity',
  priority: 72,
  evaluate() {
    if (!appCtx.activePlanetaryBodyId || appCtx.paused) return null;
    const activity = nearestActivity();
    const procedure = activity ? procedureState(activity) : null;
    return activity ? {
      available: true,
      action: activity.activityId,
      label: procedure.label,
      detail: procedure.complete ? 'Field record complete' : `Field procedure · step ${procedure.step + 1} of ${procedure.steps.length}`,
      distance: activity.distance,
      data: activity
    } : null;
  },
  perform(candidate) {
    return candidate?.data ? advanceActivity(candidate.data) : false;
  }
});

Object.assign(appCtx, {
  activatePlanetaryFieldActivities,
  clearPlanetaryFieldActivities,
  closePlanetaryJournal,
  openPlanetaryJournal,
  updatePlanetaryFieldMap,
  planetaryFieldActivitySnapshot: () => Object.freeze({
    activeBodyId: active?.bodyId || null,
    regionId: active?.regionId || null,
    activities: Object.freeze((active?.activities || []).map((entry) => Object.freeze({ ...entry, procedure: procedureState(entry) }))),
    nearest: nearestActivity(),
    closest: closestActivity()
  })
});

export {
  activatePlanetaryFieldActivities,
  BODY_FIELD_NOTES,
  clearPlanetaryFieldActivities,
  closePlanetaryJournal,
  openPlanetaryJournal,
  updatePlanetaryFieldMap
};
