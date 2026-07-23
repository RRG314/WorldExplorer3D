import { distanceLightYears, getUniverseDestinations, resolveUniverseAddress } from './catalog.js?v=5';
import { createUniverseMap } from './map.js?v=1';

let universeMap = null;
let inspectedEntity = null;
let setUniverseMapScope = null;

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

function physicalFacts(entity) {
  const physical = entity?.physical || {};
  const facts = [];
  if (Number.isFinite(physical.hostMassSolar)) facts.push(`${physical.hostMassSolar} solar masses`);
  if (Number.isFinite(physical.hostTemperatureK)) facts.push(`${physical.hostTemperatureK.toLocaleString()} K`);
  if (Number.isFinite(physical.radiusLy)) facts.push(`${physical.radiusLy.toLocaleString()} ly radius`);
  if (Number.isFinite(physical.massSolar)) facts.push(`${physical.massSolar.toLocaleString()} solar masses`);
  if (Number.isFinite(physical.memberEstimate)) facts.push(`about ${physical.memberEstimate.toLocaleString()} members`);
  if (Number.isFinite(entity?.radiusEarth)) facts.push(`${entity.radiusEarth} Earth radii`);
  if (Number.isFinite(entity?.massEarth)) facts.push(`${entity.massEarth} Earth masses`);
  if (Number.isFinite(entity?.orbitDays)) facts.push(`${entity.orbitDays.toLocaleString()} day orbit`);
  if (Number.isFinite(entity?.semiMajorAxisAu)) facts.push(`${entity.semiMajorAxisAu} AU`);
  return facts;
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

function populateDestinationSelect(select) {
  const destinations = getUniverseDestinations();
  Object.entries(CLASS_LABELS).forEach(([objectClass, label]) => {
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

function selectCatalogValue(panel, id) {
  const select = panel?.querySelector?.('#universeDestinationSelect');
  if (select && [...select.options].some((option) => option.value === id)) select.value = id;
}

function createUniverseNavigator(handlers) {
  let panel = document.getElementById('universeNavigator');
  if (panel) return panel;

  panel = document.createElement('aside');
  panel.id = 'universeNavigator';
  panel.className = 'universe-navigator';
  panel.setAttribute('aria-label', 'Universe navigation map');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="universe-heading">
      <div>
        <div class="universe-kicker">NAVIGATION FRAME</div>
        <div id="universeFrameName" class="universe-frame-name">Solar System</div>
      </div>
      <button id="universeCloseBtn" class="universe-icon-button" type="button" aria-label="Close universe navigator" title="Close universe map">×</button>
    </div>
    <div id="universeAddress" class="universe-address">universe/local-group/milky-way/sol</div>
    <div class="universe-map-toolbar" role="group" aria-label="Universe map scale">
      <button type="button" class="active" data-universe-scope="nearby">Nearby</button>
      <button type="button" data-universe-scope="galaxy">Milky Way</button>
      <button type="button" data-universe-scope="deep">Deep Space</button>
      <button type="button" data-universe-scope="system">System</button>
    </div>
    <div class="universe-map-frame">
      <canvas id="universeMapCanvas" aria-label="Spatial universe map"></canvas>
      <div class="universe-map-note">Catalog ICRS direction + logarithmic distance · System orbit radii use catalog data; orbital phase is illustrative · Drag, zoom, inspect, or double-click to travel</div>
    </div>
    <label class="universe-field" for="universeDestinationSelect">
      <span>Catalog index</span>
      <select id="universeDestinationSelect"></select>
    </label>
    <section class="universe-object-detail" aria-live="polite">
      <div id="universeObjectClass" class="universe-object-class"></div>
      <strong id="universeObjectName"></strong>
      <div id="universeDestinationMeta" class="universe-destination-meta"></div>
      <div id="universePhysicalFacts" class="universe-physical-facts"></div>
    </section>
    <div class="universe-actions" id="universePrimaryActions"></div>
    <div class="universe-actions universe-return-actions" id="universeReturnActions"></div>
    <a id="universeSourceLink" class="universe-source" href="#" target="_blank" rel="noopener noreferrer">Catalog source</a>
  `;
  document.body.appendChild(panel);

  const scopeButtons = [...panel.querySelectorAll('[data-universe-scope]')];
  const setScope = (scope) => {
    scopeButtons.forEach((button) => button.classList.toggle('active', button.dataset.universeScope === scope));
    universeMap?.setScope(scope, inspectedEntity);
  };
  setUniverseMapScope = (scope, focus) => {
    inspectedEntity = focus || inspectedEntity;
    scopeButtons.forEach((button) => button.classList.toggle('active', button.dataset.universeScope === scope));
    universeMap?.setScope(scope, focus);
  };
  universeMap = createUniverseMap(panel.querySelector('#universeMapCanvas'), {
    onInspect: (entity) => {
      inspectedEntity = entity;
      if (entity.travelable !== false) {
        handlers.onSelection?.(entity.id);
        selectCatalogValue(panel, entity.id);
      }
      setUniverseSelection(entity);
      universeMap?.inspect(entity);
    },
    onTravel: (id) => {
      if (handlers.onTravel?.(id) !== false) closeUniverseNavigator();
    }
  });
  setScope('nearby');
  scopeButtons.forEach((button) => button.addEventListener('click', () => setScope(button.dataset.universeScope)));

  const select = panel.querySelector('#universeDestinationSelect');
  populateDestinationSelect(select);
  const primaryActions = panel.querySelector('#universePrimaryActions');
  const travel = makeButton('universeTravelBtn', 'Travel to destination', 'primary');
  const enterGalaxy = makeButton('universeEnterGalaxyBtn', 'Enter current galaxy');
  const pulse = makeButton('universePulseBtn', 'Fire mining pulse');
  enterGalaxy.hidden = true;
  pulse.hidden = true;
  primaryActions.append(travel, enterGalaxy, pulse);
  const returnActions = panel.querySelector('#universeReturnActions');
  const returnSol = makeButton('universeReturnSolBtn', 'Return to Sol');
  const returnEarth = makeButton('universeReturnEarthBtn', 'Return to Earth', 'earth');
  returnActions.append(returnSol, returnEarth);

  const refreshSelection = () => handlers.onSelection?.(select.value);
  select.addEventListener('change', refreshSelection);
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

  const existingControls = document.getElementById('ssToggleContainer');
  if (existingControls && !document.getElementById('universeToggle')) {
    const toggle = makeButton('universeToggle', 'UNIVERSE MAP');
    toggle.classList.add('ssToggleBtn');
    toggle.setAttribute('aria-controls', 'universeNavigator');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', toggleUniverseNavigator);
    existingControls.appendChild(toggle);
  }
  return panel;
}

function setUniverseSelection(entity) {
  const panel = document.getElementById('universeNavigator');
  if (!panel || !entity) return;
  inspectedEntity = entity;
  if (entity.objectClass === 'exoplanet' && entity.parentId) {
    setUniverseMapScope?.('system', resolveUniverseAddress(entity.parentId));
  }
  const meta = panel.querySelector('#universeDestinationMeta');
  const source = entity.provenance?.[0];
  const generated = entity.generatedFlags?.length ? ' · generated detail labeled in scene' : '';
  meta.textContent = formatDistance(entity) + ' · ' + entity.accuracy + generated;
  panel.querySelector('#universeObjectClass').textContent = String(entity.objectClass || 'catalog object').replaceAll('_', ' ');
  panel.querySelector('#universeObjectName').textContent = entity.name || 'Unnamed object';
  const factHost = panel.querySelector('#universePhysicalFacts');
  factHost.replaceChildren(...physicalFacts(entity).map((fact) => {
    const span = document.createElement('span');
    span.textContent = fact;
    return span;
  }));
  const link = panel.querySelector('#universeSourceLink');
  if (source?.url) {
    link.href = source.url;
    link.textContent = source.label;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  universeMap?.inspect(entity);
}

function updateUniverseNavigator(state) {
  const panel = document.getElementById('universeNavigator');
  if (!panel || !state?.current) return;
  panel.querySelector('#universeFrameName').textContent = state.current.name;
  panel.querySelector('#universeAddress').textContent = state.current.address;
  const select = panel.querySelector('#universeDestinationSelect');
  if (!state.transition && select.value !== state.selected?.id) select.value = state.selected?.id || state.current.id;
  setUniverseSelection(state.selected || state.current);
  universeMap?.update(state);

  panel.classList.toggle('is-busy', Boolean(state.transition));
  select.disabled = Boolean(state.transition);
  panel.querySelector('#universeTravelBtn').disabled = Boolean(state.transition) || state.selected?.id === state.current.id;
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
  const toggle = document.getElementById('universeToggle');
  if (toggle) toggle.style.display = '';
}

function inspectUniverseEntity(entity) {
  if (!entity) return false;
  setUniverseSelection(entity);
  setNavigatorOpen(true);
  return true;
}

function hideUniverseNavigator() {
  const toggle = document.getElementById('universeToggle');
  if (toggle) toggle.style.display = 'none';
  closeUniverseNavigator();
}

export {
  closeUniverseNavigator,
  createUniverseNavigator,
  hideUniverseNavigator,
  inspectUniverseEntity,
  setUniverseSelection,
  showUniverseNavigator,
  toggleUniverseNavigator,
  updateUniverseNavigator
};
