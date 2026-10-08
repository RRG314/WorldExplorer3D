// Player-facing loading copy. Feature cards describe available play, not work
// supposedly happening in the loader. Only pipeline events advance the bar.
export const LOADING_NOTE = 'A whole place takes a little unpacking. Detailed locations can take more than a minute to load, especially on your first visit.';
export const LOADING_CARDS = Object.freeze([
  { id: 'drive', modes: ['earth'], topic: 'On the road', title: 'Take the E34 for a spin', text: 'Explore by car in the BMW 525i E34, then switch to walking for a closer look at the neighborhood.' },
  { id: 'flight', modes: ['earth'], topic: 'Travel tip', title: 'A different view from above', text: 'At supported airports, board an aircraft for a local flight or choose a destination. You can travel as pilot or passenger.' },
  { id: 'ocean', modes: ['ocean'], topic: 'Ocean exploration', title: 'Start on deck. Go deeper.', text: 'Ocean outings begin aboard the research vessel. Walk the deck, swim, scuba dive or deploy the submarine, then return to your ship.' },
  { id: 'journal', modes: ['earth', 'ocean', 'moon', 'mars'], topic: 'Field tip', title: 'Bring back more than a photo', text: 'Inspect, photograph and survey as you explore. Open the Journal to revisit your recorded finds and the Field Guide to see what you have discovered.' },
  { id: 'ship', modes: ['space'], topic: 'Interstellar Expeditions · Alpha', title: 'Your home between worlds', text: 'Live aboard Solis Reach, meet the crew and follow voyage missions. Pathfinder takes you from the ship to supported planetary field sites and back.' },
  { id: 'gps', modes: ['earth'], topic: 'Explore nearby', title: 'Your neighborhood is a starting point', text: 'Choose your current location to explore nearby. Live GPS is a separate walking mode that follows your position when you allow location access.' },
  { id: 'quake', modes: ['earth'], topic: 'Real-world data', title: 'See where Earth has been moving', text: 'The globe’s Earthquakes view shows recent reports from the USGS. Select an event to inspect its location, magnitude and depth.' },
  { id: 'stars', modes: ['space'], topic: 'Beyond the solar system', title: 'Pick a star system', text: 'Explore selected systems and exoplanets using catalog data, including the NASA Exoplanet Archive. Playable surfaces are imagined landscapes, not photographs of those worlds.' },
  { id: 'boat', modes: ['earth', 'ocean'], topic: 'On the water', title: 'Trade the road for a waterway', text: 'Look for boardable vessels at supported ports and marinas. Boats and ships offer another way to explore the water around your location.' },
  { id: 'terrain', modes: ['earth'], topic: 'The world around you', title: 'Follow the lay of the land', text: 'Roads, bridges, tunnels and terrain come together from real map data. Coverage varies by location, so each place has a different level of detail.' },
  { id: 'backpack', modes: ['earth', 'ocean', 'moon', 'mars'], topic: 'Field tip', title: 'Keep a tool within reach', text: 'Open your Backpack and set up quick slots for the tools you use most. A little preparation makes it easier to stop and investigate something along the way.' },
  { id: 'planets', modes: ['moon', 'mars', 'space'], topic: 'Planetary exploration', title: 'Look closer at familiar worlds', text: 'Supported planetary destinations combine NASA and USGS source imagery with terrain built for exploration. Check a destination’s information to see where its data comes from.' }
].map(card => Object.freeze({ ...card, modes: Object.freeze(card.modes) })));

export function loadingCardsForMode(mode) {
  // Start with two relevant ideas, then introduce the rest of the game before
  // repeating. Earth players should not have to wait through eight city tips
  // to hear about the ocean or the ship.
  const lead = ({ earth: ['drive', 'flight'], ocean: ['ocean', 'boat'], space: ['ship', 'stars'], moon: ['planets', 'journal'], mars: ['planets', 'journal'] })[mode] || [];
  return [...lead.map(id => LOADING_CARDS.find(card => card.id === id)), ...LOADING_CARDS.filter(card => !lead.includes(card.id))];
}

const PHASES = Object.freeze({
  prepareAcceptedGround: [8, 'Finding your place'],
  fetchFixedRegionalContext: [12, 'Gathering the local map'],
  fetchOverpass: [14, 'Gathering the local map'],
  fetchFixedRegionalStructures: [20, 'Gathering the local map'],
  featureBudgeting: [25, 'Shaping the landscape'],
  waitForTransportGround: [28, 'Shaping the landscape'],
  buildRoadGeometry: [32, 'Laying out the roads'],
  buildLanduseGeometry: [36, 'Adding land and water'],
  batchLanduseGeometry: [40, 'Adding land and water'],
  buildBuildingGeometry: [44, 'Adding buildings and local detail'],
  publishBuildingFacadeEntrances: [48, 'Adding buildings and local detail'],
  publishBuildingExteriorDetails: [50, 'Adding buildings and local detail'],
  batchBuildingGeometry: [54, 'Adding buildings and local detail'],
  publishLocationTerrain: [57, 'Joining the landscape together'],
  waitForLocationTerrainPublication: [58, 'Joining the landscape together'],
  publishCompiledTransportMeshes: [62, 'Connecting roads, bridges and tunnels'],
  refreshTerrainSurfaceProfiles: [70, 'Connecting roads, bridges and tunnels'],
  publishStreetPavement: [72, 'Finishing streets and sidewalks'],
  buildTraversalNetworks: [89, 'Preparing routes through the world'],
  spawnPlayer: [91, 'Getting ready for your arrival'],
  gameplay: [93, 'Getting ready for your arrival'],
  livingWorld: [94, 'Getting ready for your arrival'],
  urbanSandbox: [95, 'Getting ready for your arrival'],
  aviation: [96, 'Getting ready for your arrival'],
  maritime: [97, 'Getting ready for your arrival'],
  worldDiscovery: [99, 'Getting ready for your arrival']
});
const MODE_LABELS = Object.freeze({ earth: 'Preparing your location', ocean: 'Preparing your ocean outing', space: 'Preparing your space journey', moon: 'Preparing your Moon visit', mars: 'Preparing your Mars visit' });

export function nextLoadingProgress(previous, options = {}) {
  const mode = options.mode || previous?.mode || 'earth';
  const reset = !previous || options.restart || previous.mode !== mode;
  const state = reset ? { mode, value: mode === 'earth' && !options.transition ? 3 : null, label: MODE_LABELS[mode] || 'Preparing your visit' } : previous;
  if (mode !== 'earth' || options.transition) return { ...state, value: null };
  const phase = PHASES[options.phase];
  if (!phase) return state;
  let value = phase[0];
  if (options.phase === 'publishStreetPavement' && Number.isFinite(options.completed) && Number.isFinite(options.total) && options.total > 0) {
    value += 15 * Math.max(0, Math.min(1, options.completed / options.total));
  }
  // Late parallel phases cannot move the bar or its description backwards.
  // 100% is never inferred from time, bytes, a worker tile, or a failed task.
  return value >= (state.value ?? 0) ? { mode, value, label: phase[1] } : state;
}

export function createLoadingPresentation(doc, { setInterval: startTimer = globalThis.setInterval, clearInterval: stopTimer = globalThis.clearInterval, reducedMotion = () => doc.documentElement?.dataset.we3dMotion === 'reduce' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true } = {}) {
  let state = null, timer = null, index = 0, cards = [], paused = false, active = false;
  const el = id => doc.getElementById(id);
  const write = (id, value) => { const node = el(id); if (node && node.textContent !== value) node.textContent = value; };
  const stop = () => { if (timer !== null) stopTimer(timer); timer = null; };
  const renderCard = () => {
    const card = cards[index];
    if (!card) return;
    write('loadTipTopic', card.topic);
    write('loadTipTitle', card.title);
    write('loadTipText', card.text);
    write('loadTipCount', `${index + 1} / ${cards.length}`);
    if (el('loadTip')) el('loadTip').dataset.card = card.id;
    write('loadTipPause', paused ? 'Play tips' : 'Pause tips');
    el('loadTipPause')?.setAttribute('aria-pressed', String(paused));
  };
  const tick = () => {
    if (el('loading')?.dataset.state === 'error') { active = false; stop(); return; }
    if (!active || paused || doc.hidden || !el('loading')?.classList.contains('show')) return;
    index = (index + 1) % cards.length;
    renderCard();
  };
  const browse = direction => { paused = true; index = (index + direction + cards.length) % cards.length; renderCard(); };
  el('loadTipPrevious')?.addEventListener('click', () => browse(-1));
  el('loadTipNext')?.addEventListener('click', () => browse(1));
  el('loadTipPause')?.addEventListener('click', () => { paused = !paused; renderCard(); });
  return {
    show(options = {}) {
      const restart = !active || options.restart || (options.mode && options.mode !== state?.mode);
      state = nextLoadingProgress(state, { ...options, restart });
      if (restart) {
        stop(); index = 0; cards = loadingCardsForMode(state.mode); paused = reducedMotion();
        timer = startTimer(tick, 12000);
      }
      active = true;
      el('loading')?.setAttribute('aria-busy', 'true');
      if (el('loading')) el('loading').dataset.state = 'loading';
      if (el('loadRetry')) el('loadRetry').hidden = true;
      write('loadTitle', 'Getting the world ready');
      write('loadNote', LOADING_NOTE);
      write('loadText', state.label);
      const progress = el('loadProgress');
      if (progress) {
        progress.hidden = false;
        if (state.value === null) progress.removeAttribute('value');
        else progress.value = state.value;
      }
      write('loadPercent', state.value === null ? '' : `${Math.floor(state.value)}%`);
      renderCard();
    },
    hide() { active = false; stop(); state = null; el('loading')?.setAttribute('aria-busy', 'false'); },
    snapshot() { return { active, paused, card: cards[index]?.id, ...state }; }
  };
}
