import { getAstronomicalBody } from '../astronomy/body-catalog.js?v=2';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { createIndexedDbDiscoveryProfileStore } from '../discovery/profile-store.js?v=4';

const INTERACTION_RADIUS = 18;
const ACTIVITY_OFFSETS = Object.freeze([
  Object.freeze({ x: 12, z: -8 }),
  Object.freeze({ x: -44, z: 18 }),
  Object.freeze({ x: 16, z: 58 })
]);

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

function markerFor(activity) {
  const group = new THREE.Group();
  group.name = `${activity.bodyId} ${activity.activityId} field marker`;
  const color = activity.activityId === 'photograph' ? 0x6fd5ff : activity.activityId === 'geology-inspect' ? 0xffc866 : 0x83e6a6;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.12, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.1, 2.6, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 })
  );
  beacon.position.y = 1.3;
  group.add(beacon);
  group.position.set(activity.x, activity.y + 0.08, activity.z);
  group.userData.truthClass = 'generated_game_detail';
  group.userData.planetaryFieldActivityId = activity.id;
  return group;
}

function activatePlanetaryFieldActivities(pack, world, sampleHeight) {
  const definitions = BODY_FIELD_NOTES[pack?.bodyId];
  if (!definitions || !world || typeof sampleHeight !== 'function') {
    active = null;
    return Object.freeze([]);
  }
  if (!world.fieldActivities) {
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
      world.objects.push(marker);
      appCtx.scene.add(marker);
      return activity;
    });
  }
  active = Object.freeze({
    bodyId: pack.bodyId,
    regionId: pack.manifest.regionId,
    center: Object.freeze({ x: pack.spawn.x, z: pack.spawn.z }),
    activities: world.fieldActivities
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
  if (hint) hint.textContent = nearby
    ? `${nearby.label} · ${Math.round(nearby.distance)} m · use E or Explore`
    : closest
      ? `Nearest: ${closest.label} · ${Math.round(closest.distance)} m`
      : 'Blue: photo · gold: surface · green: environment';
}

async function recordActivity(activity) {
  const body = getAstronomicalBody(activity.bodyId);
  if (!body) return false;
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
    regionLabel: `${body.presentation.surfaceLabel}, ${body.name}`,
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
  globalThis.dispatchEvent?.(new CustomEvent('we3d:planetary-field-recorded', { detail: { activity, result } }));
  if (planetaryJournalOpen) void refreshPlanetaryJournal();
  return true;
}

appCtx.registerContextInteraction?.({
  id: 'planetary-field-activity',
  priority: 72,
  evaluate() {
    if (!appCtx.activePlanetaryBodyId || appCtx.paused) return null;
    const activity = nearestActivity();
    return activity ? {
      available: true,
      action: activity.activityId,
      label: activity.label,
      detail: 'Planetary field point',
      distance: activity.distance,
      data: activity
    } : null;
  },
  perform(candidate) {
    return candidate?.data ? recordActivity(candidate.data) : false;
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
    activities: Object.freeze((active?.activities || []).map((entry) => Object.freeze({ ...entry }))),
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
