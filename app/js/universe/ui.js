import { distanceLightYears, getUniverseDestinations } from './catalog.js?v=6';

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
    <label class="universe-field" for="universeDestinationSelect">
      <span>Catalog destination</span>
      <select id="universeDestinationSelect"></select>
    </label>
    <div id="universeDestinationMeta" class="universe-destination-meta"></div>
    <div class="universe-actions" id="universePrimaryActions"></div>
    <div class="universe-actions universe-return-actions" id="universeReturnActions"></div>
    <a id="universeSourceLink" class="universe-source" href="#" target="_blank" rel="noopener noreferrer">Catalog source</a>
  `;
  document.body.appendChild(panel);

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
  const meta = panel.querySelector('#universeDestinationMeta');
  const source = entity.provenance?.[0];
  const generated = entity.generatedFlags?.length ? ' · generated detail labeled in scene' : '';
  meta.textContent = formatDistance(entity) + ' · ' + entity.accuracy + generated;
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
  if (!state.transition && select.value !== state.selected?.id) select.value = state.selected?.id || state.current.id;
  setUniverseSelection(state.selected || state.current);

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

function hideUniverseNavigator() {
  const toggle = document.getElementById('universeToggle');
  if (toggle) toggle.style.display = 'none';
  closeUniverseNavigator();
}

export {
  closeUniverseNavigator,
  createUniverseNavigator,
  hideUniverseNavigator,
  setUniverseSelection,
  showUniverseNavigator,
  toggleUniverseNavigator,
  updateUniverseNavigator
};
