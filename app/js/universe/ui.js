import { distanceLightYears, getUniverseDestinations } from './catalog.js?v=11';
import { getDestinationMission } from './mission-catalog.js?v=3';

const CLASS_LABELS = Object.freeze({
  planetary_system: 'Star Systems',
  nebula: 'Nebulae',
  stellar_region: 'Galaxy Regions',
  galaxy: 'Galaxies',
  galaxy_cluster: 'Galaxy Clusters',
  black_hole: 'Black Holes'
});

function formatDistance(entity) {
  if (entity.id === 'sol') return 'Current home system';
  const lightYears = distanceLightYears(entity);
  if (!lightYears) return 'Catalog reference frame';
  if (lightYears < 1000) return `${lightYears.toFixed(lightYears < 10 ? 2 : 1)} light-years`;
  if (lightYears < 1000000) return `${Math.round(lightYears).toLocaleString()} light-years`;
  return `${(lightYears / 1000000).toFixed(2)} million light-years`;
}

function makeButton(id, label, className = '') {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = `universe-action ${className}`.trim();
  button.textContent = label;
  return button;
}

function setNavigatorOpen(open) {
  const panel = document.getElementById('universeNavigator');
  if (!panel) return false;
  panel.hidden = !open;
  panel.setAttribute('aria-hidden', String(!open));
  const toggle = document.getElementById('universeToggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  return true;
}

function closeUniverseNavigator() {
  return setNavigatorOpen(false);
}

function toggleUniverseNavigator() {
  const panel = document.getElementById('universeNavigator');
  return panel ? setNavigatorOpen(panel.hidden) : false;
}

function ensureUniverseToggle() {
  const existingControls = document.getElementById('ssToggleContainer');
  if (!existingControls) return null;
  let toggle = document.getElementById('universeToggle');
  if (toggle) return toggle;
  toggle = makeButton('universeToggle', 'WAYFINDER');
  toggle.classList.add('ssToggleBtn');
  toggle.setAttribute('aria-controls', 'universeNavigator');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', toggleUniverseNavigator);
  existingControls.appendChild(toggle);
  return toggle;
}

function populateDestinationSelect(select) {
  const destinations = getUniverseDestinations();
  select.replaceChildren();
  const systems = destinations.filter((item) => item.objectClass === 'planetary_system');
  const systemGroup = document.createElement('optgroup');
  systemGroup.label = CLASS_LABELS.planetary_system;
  systems.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    systemGroup.appendChild(option);
  });
  if (systemGroup.children.length) select.appendChild(systemGroup);
  systems.forEach((system) => {
    const planets = destinations.filter((item) => item.objectClass === 'exoplanet' && item.parentFrameId === system.id);
    if (!planets.length) return;
    const group = document.createElement('optgroup');
    group.label = `${system.name} · planets`;
    planets.forEach((planet) => {
      const option = document.createElement('option');
      option.value = planet.id;
      option.textContent = planet.name;
      group.appendChild(option);
    });
    select.appendChild(group);
  });
  Object.entries(CLASS_LABELS).forEach(([objectClass, label]) => {
    if (objectClass === 'planetary_system') return;
    const group = document.createElement('optgroup');
    group.label = label;
    destinations.filter((item) => item.objectClass === objectClass).forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      group.appendChild(option);
    });
    if (group.children.length) select.appendChild(group);
  });
}

function syncDestinationSelect(select) {
  const signature = getUniverseDestinations().map((item) => item.id).sort().join('|');
  if (select.dataset.destinationSignature === signature) return false;
  const selected = select.value;
  populateDestinationSelect(select);
  select.dataset.destinationSignature = signature;
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  return true;
}

function createUniverseNavigator(handlers) {
  let panel = document.getElementById('universeNavigator');
  if (panel) return panel;

  panel = document.createElement('aside');
  panel.id = 'universeNavigator';
  panel.className = 'universe-navigator';
  panel.setAttribute('aria-label', 'Wayfinder navigation map');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="universe-heading">
      <div>
        <div class="universe-kicker">WAYFINDER · NAVIGATION FRAME</div>
        <div id="universeFrameName" class="universe-frame-name">Solar System</div>
      </div>
      <button id="universeCloseBtn" class="universe-icon-button" type="button" aria-label="Close universe navigator" title="Close universe map">×</button>
    </div>
    <div id="universeAddress" class="universe-address">universe/local-group/milky-way/sol</div>
    <label class="universe-field" for="universeDestinationSelect">
      <span>Catalog destination</span>
      <select id="universeDestinationSelect"></select>
    </label>
    <div id="universeDestinationMeta" class="universe-destination-meta"></div>
    <div id="universeCourseReadout" class="universe-course-readout" aria-live="polite">
      <span class="universe-course-status">NO COURSE SET</span>
      <strong>Choose a destination</strong>
      <small>The flight HUD and in-world marker will follow the course you engage.</small>
    </div>
    <div class="universe-actions" id="universePrimaryActions"></div>
    <div class="universe-actions universe-return-actions" id="universeReturnActions"></div>
    <a id="universeSourceLink" class="universe-source" href="#" target="_blank" rel="noopener noreferrer">Catalog source</a>
  `;
  document.body.appendChild(panel);

  if (!document.getElementById('universeCourseCue')) {
    const cue = document.createElement('div');
    cue.id = 'universeCourseCue';
    cue.className = 'universe-course-cue';
    cue.hidden = true;
    cue.setAttribute('aria-live', 'polite');
    cue.innerHTML = `
      <span class="universe-course-cue-arrow" aria-hidden="true">▲</span>
      <span class="universe-course-cue-copy">
        <strong>COURSE</strong>
        <small>Destination</small>
      </span>
    `;
    document.body.appendChild(cue);
  }

  const select = panel.querySelector('#universeDestinationSelect');
  syncDestinationSelect(select);
  const primaryActions = panel.querySelector('#universePrimaryActions');
  const mission = makeButton('universeMissionBtn', 'Mission briefing');
  const travel = makeButton('universeTravelBtn', 'Travel to destination', 'primary');
  const enterGalaxy = makeButton('universeEnterGalaxyBtn', 'Enter current galaxy');
  const pulse = makeButton('universePulseBtn', 'Fire mining pulse');
  enterGalaxy.hidden = true;
  pulse.hidden = true;
  primaryActions.append(mission, travel, enterGalaxy, pulse);
  const returnActions = panel.querySelector('#universeReturnActions');
  const returnSol = makeButton('universeReturnSolBtn', 'Return to Sol');
  const returnEarth = makeButton('universeReturnEarthBtn', 'Return to Earth', 'earth');
  returnActions.append(returnSol, returnEarth);

  const refreshSelection = () => handlers.onSelection?.(select.value);
  select.addEventListener('change', refreshSelection);
  mission.addEventListener('click', () => handlers.onMission?.(select.value));
  travel.addEventListener('click', () => {
    if (handlers.onTravel?.(select.value) !== false) closeUniverseNavigator();
  });
  enterGalaxy.addEventListener('click', () => {
    if (handlers.onEnterGalaxy?.() !== false) closeUniverseNavigator();
  });
  pulse.addEventListener('click', () => handlers.onPulse?.());
  returnSol.addEventListener('click', () => {
    if (handlers.onReturnSol?.() !== false) closeUniverseNavigator();
  });
  returnEarth.addEventListener('click', () => {
    if (handlers.onReturnEarth?.() !== false) closeUniverseNavigator();
  });
  panel.querySelector('#universeCloseBtn').addEventListener('click', closeUniverseNavigator);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closeUniverseNavigator();
  });
  document.addEventListener('pointerdown', (event) => {
    if (panel.hidden || panel.contains(event.target) || event.target.closest?.('#universeToggle')) return;
    closeUniverseNavigator();
  });

  ensureUniverseToggle();
  return panel;
}

function updateUniverseCourseCue(cueState = null) {
  const cue = document.getElementById('universeCourseCue');
  if (!cue) return;
  const visible = Boolean(cueState?.visible);
  cue.hidden = !visible;
  cue.setAttribute('aria-hidden', String(!visible));
  if (!visible) return;
  cue.style.left = `${Math.round(Number(cueState.x) || 0)}px`;
  cue.style.top = `${Math.round(Number(cueState.y) || 0)}px`;
  cue.style.setProperty('--course-cue-angle', `${Number(cueState.angleDeg) || 0}deg`);
  cue.classList.toggle('is-assisted', cueState.assisted === true);
  cue.querySelector('strong').textContent = cueState.assisted ? 'FLIGHT ASSIST' : 'COURSE';
  cue.querySelector('small').textContent = cueState.label || 'Destination';
}

function setUniverseSelection(entity) {
  const panel = document.getElementById('universeNavigator');
  if (!panel || !entity) return;
  const meta = panel.querySelector('#universeDestinationMeta');
  const source = entity.provenance?.[0];
  const host = entity.objectClass === 'exoplanet' ? ` · ${entity.hostName}` : '';
  const generated = entity.generatedFlags?.length ? ' · modeled display details' : '';
  const mission = getDestinationMission(entity.id);
  const habitability = mission?.habitability?.candidate ? ' · temperate-world candidate' : '';
  meta.textContent = formatDistance(entity) + host + ' · ' + entity.accuracy + generated + habitability;
  const link = panel.querySelector('#universeSourceLink');
  if (source?.url) {
    link.href = source.url;
    link.textContent = source.label;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

function updateUniverseNavigator(state) {
  const panel = document.getElementById('universeNavigator');
  if (!panel || !state?.current) return;
  panel.querySelector('#universeFrameName').textContent = state.current.name;
  panel.querySelector('#universeAddress').textContent = state.current.address;
  const select = panel.querySelector('#universeDestinationSelect');
  syncDestinationSelect(select);
  if (!state.transition && select.value !== state.selected?.id) select.value = state.selected?.id || state.current.id;
  setUniverseSelection(state.selected || state.current);

  const course = state.course;
  const readout = panel.querySelector('#universeCourseReadout');
  const status = readout.querySelector('.universe-course-status');
  const title = readout.querySelector('strong');
  const detail = readout.querySelector('small');
  if (course?.destination) {
    const isTransit = course.status === 'transit' || Boolean(state.transition);
    readout.classList.add('has-course');
    status.textContent = isTransit ? 'COURSE ENGAGED' : 'COURSE ACTIVE';
    title.textContent = course.destination.name;
    detail.textContent = course.destination.objectClass === 'exoplanet'
      ? `Orbital approach via ${course.frame.name} · marker and flight HUD linked`
      : `${course.frame.address} · flight HUD linked`;
  } else {
    readout.classList.remove('has-course');
    status.textContent = 'NO COURSE SET';
    title.textContent = 'Choose a destination';
    detail.textContent = 'The flight HUD and in-world marker will follow the course you engage.';
  }
  const toggle = document.getElementById('universeToggle');
  if (toggle) {
    toggle.textContent = course?.destination
      ? `WAYFINDER · ${course.destination.name}`
      : 'WAYFINDER';
    toggle.classList.toggle('has-course', Boolean(course?.destination));
    toggle.title = course?.destination
      ? `Active course: ${course.destination.name}`
      : 'Open Wayfinder';
  }

  panel.classList.toggle('is-busy', Boolean(state.transition));
  select.disabled = Boolean(state.transition);
  const travel = panel.querySelector('#universeTravelBtn');
  const mission = panel.querySelector('#universeMissionBtn');
  const selectedName = state.selected?.name || 'destination';
  const selectedMission = getDestinationMission(state.selected?.id);
  mission.hidden = !selectedMission;
  mission.disabled = Boolean(state.transition) || !selectedMission;
  if (selectedMission) mission.textContent = `MISSION · ${selectedMission.title}`;
  travel.textContent = state.transition
    ? `TRAVELING · ${state.transition.destination?.name || state.transition.to?.name || selectedName}`
    : state.course?.destination?.id === state.selected?.id
      ? `COURSE ACTIVE · ${selectedName}`
      : `SET COURSE · ${selectedName}`;
  travel.disabled = Boolean(state.transition) || state.course?.destination?.id === state.selected?.id;
  const enterGalaxy = panel.querySelector('#universeEnterGalaxyBtn');
  const canEnterGalaxy = Boolean(state.galaxyEntry && state.current.objectClass === 'galaxy');
  enterGalaxy.hidden = !canEnterGalaxy;
  enterGalaxy.disabled = Boolean(state.transition);
  if (canEnterGalaxy) enterGalaxy.textContent = 'Enter ' + state.current.name;
  const pulse = panel.querySelector('#universePulseBtn');
  pulse.hidden = state.encounter?.type !== 'generated-asteroids';
  pulse.disabled = Boolean(state.transition) || Number(state.encounter?.active || 0) <= 0;
  panel.querySelector('#universeReturnSolBtn').disabled = Boolean(state.transition) || state.current.id === 'sol';
  panel.querySelector('#universeReturnEarthBtn').disabled = Boolean(state.transition);
}

function showUniverseNavigator() {
  const toggle = ensureUniverseToggle();
  if (toggle) toggle.style.display = '';
}

function hideUniverseNavigator() {
  const toggle = document.getElementById('universeToggle');
  if (toggle) toggle.style.display = 'none';
  updateUniverseCourseCue(null);
  closeUniverseNavigator();
}

export {
  closeUniverseNavigator,
  createUniverseNavigator,
  hideUniverseNavigator,
  setUniverseSelection,
  showUniverseNavigator,
  toggleUniverseNavigator,
  updateUniverseCourseCue,
  updateUniverseNavigator
};
