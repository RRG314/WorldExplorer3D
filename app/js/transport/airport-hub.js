import { searchPlaces } from '../places/place-search.js?v=2';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function installStyles() {
  if (document.getElementById('airportHubStyles')) return;
  const style = document.createElement('style');
  style.id = 'airportHubStyles';
  style.textContent = `
    .airport-hub{border:1px solid rgba(151,216,229,.36);border-radius:20px;padding:0;background:linear-gradient(155deg,#101c24 0%,#0b141b 100%);color:#edf8f9;width:min(720px,calc(100vw - 28px));max-height:min(780px,calc(100vh - 28px));box-shadow:0 24px 80px rgba(0,0,0,.62);font:500 15px/1.45 system-ui,sans-serif;overflow:hidden}
    .airport-hub::backdrop{background:rgba(2,8,13,.72);backdrop-filter:blur(5px)}
    .airport-hub__head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 24px 17px;border-bottom:1px solid rgba(151,216,229,.16)}
    .airport-hub__eyebrow{display:block;color:#8bdbe7;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px}
    .airport-hub h2{font-size:24px;line-height:1.1;margin:0}.airport-hub p{margin:5px 0 0;color:#aec0c7}.airport-hub button,.airport-hub input{font:inherit}
    .airport-hub__close{border:0;background:rgba(255,255,255,.08);color:#fff;width:38px;height:38px;border-radius:12px;cursor:pointer;font-size:21px}
    .airport-hub__body{padding:20px 24px 24px;overflow:auto;max-height:calc(100vh - 150px)}
    .airport-hub__mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:rgba(255,255,255,.045);padding:5px;border-radius:14px;margin-bottom:18px}
    .airport-hub__mode button{border:1px solid transparent;background:transparent;color:#afbec5;padding:11px;border-radius:10px;cursor:pointer}.airport-hub__mode button[aria-pressed=true]{background:#d8f1f2;color:#122129;font-weight:800}
    .airport-hub__local{display:none;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px 16px;background:rgba(91,184,202,.1);border:1px solid rgba(120,213,226,.2);border-radius:14px;margin-bottom:18px}.airport-hub__local.show{display:grid}
    .airport-hub__local strong{display:block}.airport-hub__local small{color:#a8bac1}.airport-hub__primary{border:0;border-radius:11px;background:#8ce2e8;color:#102027;font-weight:850;padding:11px 16px;cursor:pointer}
    .airport-hub__label{display:block;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#b9c8cd;margin:0 0 7px}
    .airport-hub__search{display:grid;grid-template-columns:1fr auto;gap:8px}.airport-hub__search input{min-width:0;background:#111f28;color:#fff;border:1px solid #38515e;border-radius:12px;padding:12px 13px;outline:none}.airport-hub__search input:focus{border-color:#87dce6;box-shadow:0 0 0 3px rgba(135,220,230,.12)}
    .airport-hub__search button{border:1px solid #54717c;background:#1c303a;color:#fff;border-radius:12px;padding:0 17px;cursor:pointer;font-weight:750}
    .airport-hub__status{min-height:22px;color:#9fb0b7;font-size:13px;margin:8px 2px 10px}
    .airport-hub__results{display:grid;gap:8px}.airport-hub__result{display:grid;grid-template-columns:1fr auto;gap:12px;text-align:left;border:1px solid rgba(142,190,201,.18);background:rgba(255,255,255,.035);color:#eef8fa;border-radius:13px;padding:12px 14px;cursor:pointer}.airport-hub__result:hover,.airport-hub__result.selected{border-color:#76d6df;background:rgba(98,208,219,.12)}.airport-hub__result span{display:block}.airport-hub__result small{display:block;color:#9fb0b7;margin-top:2px}.airport-hub__result b{color:#9ce3e9;font-size:12px;align-self:center}
    .airport-hub__footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding-top:17px;border-top:1px solid rgba(151,216,229,.14)}.airport-hub__footer small{color:#91a5ad}.airport-hub__travel{border:0;border-radius:12px;background:#e17d4d;color:#15110d;font-weight:900;padding:12px 18px;cursor:pointer}.airport-hub__travel:disabled{opacity:.4;cursor:not-allowed}
    @media(max-width:600px){.airport-hub{width:calc(100vw - 16px);max-height:calc(100vh - 16px);border-radius:16px}.airport-hub__head{padding:17px 17px 14px}.airport-hub__body{padding:16px 17px 20px}.airport-hub h2{font-size:21px}.airport-hub__local{grid-template-columns:1fr}.airport-hub__search{grid-template-columns:1fr}.airport-hub__search button{padding:11px}.airport-hub__footer{align-items:stretch;flex-direction:column}.airport-hub__travel{width:100%}}
  `;
  document.head.appendChild(style);
}

function createAirportHub(options = {}) {
  if (typeof document === 'undefined') return null;
  installStyles();
  const appCtx = options.appCtx;
  const dialog = document.createElement('dialog');
  dialog.className = 'airport-hub';
  dialog.setAttribute('aria-label', 'Airport travel');
  dialog.innerHTML = `
    <header class="airport-hub__head"><div><span class="airport-hub__eyebrow">Airport</span><h2>Where do you want to fly?</h2><p>Fly yourself or ride along and explore from the air.</p></div><button class="airport-hub__close" type="button" aria-label="Close">×</button></header>
    <div class="airport-hub__body">
      <div class="airport-hub__mode" aria-label="Choose your role"><button type="button" data-role="pilot" aria-pressed="true">Pilot</button><button type="button" data-role="passenger" aria-pressed="false">Passenger</button></div>
      <section class="airport-hub__local"><div><strong class="airport-hub__aircraft">Aircraft</strong><small>Take the controls here and fly freely.</small></div><button class="airport-hub__primary" type="button">Fly locally</button></section>
      <label class="airport-hub__label" for="airportDestinationSearch">City, place, or airport</label>
      <div class="airport-hub__search"><input id="airportDestinationSearch" autocomplete="off" placeholder="Try Chicago, Tokyo, or BWI Airport"><button type="button">Search</button></div>
      <div class="airport-hub__status" aria-live="polite">Search worldwide. These are game journeys, not real airline schedules.</div>
      <div class="airport-hub__results"></div>
      <footer class="airport-hub__footer"><small class="airport-hub__progress">Airport arrivals are saved to My Explorer.</small><button class="airport-hub__travel" type="button" disabled>Choose a destination</button></footer>
    </div>`;
  document.body.appendChild(dialog);
  const refs = {
    close: dialog.querySelector('.airport-hub__close'),
    local: dialog.querySelector('.airport-hub__local'),
    aircraft: dialog.querySelector('.airport-hub__aircraft'),
    flyLocal: dialog.querySelector('.airport-hub__primary'),
    input: dialog.querySelector('input'),
    search: dialog.querySelector('.airport-hub__search button'),
    status: dialog.querySelector('.airport-hub__status'),
    results: dialog.querySelector('.airport-hub__results'),
    travel: dialog.querySelector('.airport-hub__travel'),
    progress: dialog.querySelector('.airport-hub__progress')
  };
  const state = { role: 'pilot', selected: null, vehicle: null, results: [], traveling: false };

  function setRole(role) {
    state.role = role === 'passenger' ? 'passenger' : 'pilot';
    dialog.querySelectorAll('[data-role]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.role === state.role)));
    refs.travel.textContent = state.selected ? `${state.role === 'pilot' ? 'Fly to' : 'Travel to'} ${state.selected.name}` : 'Choose a destination';
  }

  function renderResults() {
    refs.results.innerHTML = state.results.map((result, index) => `
      <button class="airport-hub__result${state.selected === result ? ' selected' : ''}" type="button" data-result-index="${index}">
        <span><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml([result.region, result.country].filter(Boolean).join(', ') || result.displayName || 'Worldwide destination')}</small></span>
        <b>${result.countryCode && result.countryCode !== appCtx.LOC?.countryCode ? 'INTERNATIONAL' : 'DESTINATION'}</b>
      </button>`).join('');
    refs.results.querySelectorAll('[data-result-index]').forEach((button) => button.addEventListener('click', () => {
      state.selected = state.results[Number(button.dataset.resultIndex)] || null;
      renderResults();
      refs.travel.disabled = !state.selected;
      setRole(state.role);
    }));
  }

  async function runSearch() {
    const query = refs.input.value.trim();
    if (!query) { refs.status.textContent = 'Enter a city, place, airport, or coordinates.'; return; }
    refs.search.disabled = true;
    refs.status.textContent = 'Finding destinations…';
    try {
      state.results = await searchPlaces(query, { limit: 6 });
      state.selected = null;
      refs.status.textContent = state.results.length ? `${state.results.length} destination${state.results.length === 1 ? '' : 's'} found.` : 'No matching destination. Try a nearby city or landmark.';
      refs.travel.disabled = true;
      renderResults();
    } catch (error) {
      refs.status.textContent = error?.message || 'Destination search is unavailable right now.';
    } finally {
      refs.search.disabled = false;
    }
  }

  async function beginJourney() {
    const destination = state.selected;
    if (!destination || state.traveling) return false;
    state.traveling = true;
    refs.travel.disabled = true;
    refs.status.textContent = `Preparing ${state.role === 'pilot' ? 'your flight' : 'the flight'} to ${destination.name}…`;
    const vehicleCatalogId = state.vehicle?.catalog?.id || (state.role === 'passenger' ? 'regional-jet' : 'personal-prop');
    const currentLat = Number(appCtx.LOC?.lat);
    const currentLon = Number(appCtx.LOC?.lon);
    const destinationLat = Number(destination.lat);
    const destinationLon = Number(destination.lon);
    const sameLoadedWorld = Number.isFinite(currentLat) && Number.isFinite(currentLon) &&
      Number.isFinite(destinationLat) && Number.isFinite(destinationLon) &&
      Math.hypot(destinationLat - currentLat, destinationLon - currentLon) < .001;
    dialog.close();
    appCtx.setTravelMode?.('walk', { source: 'airport_transfer_prepare', force: true, emitTutorial: false });
    if (!sameLoadedWorld) {
      appCtx.setCustomLocation?.({
        lat: destinationLat,
        lon: destinationLon,
        name: destination.name,
        countryCode: destination.countryCode,
        arrivalMode: 'walk',
        locationDetails: {
          region: destination.region,
          country: destination.country,
          displayName: destination.displayName,
          airportClass: destination.airportClass || '',
          iata: destination.iata || '',
          icao: destination.icao || ''
        }
      }, { transient: false });
      await appCtx.loadRoads?.();
    }
    const layout = appCtx.aviationRuntime?.airportLayout;
    const center = layout?.center || { x: 0, z: 0 };
    const groundY = Number(appCtx.SurfaceQuery?.terrainAt?.(center.x, center.z)?.position?.y ?? appCtx.elevationWorldYAtWorldXZ?.(center.x, center.z)) || 0;
    const started = appCtx.setTravelMode?.('plane', {
      source: 'airport_destination_arrival',
      force: true,
      x: center.x,
      y: groundY + (state.role === 'passenger' ? 125 : 92),
      z: center.z,
      yaw: layout?.yaw || 0,
      speed: state.role === 'passenger' ? 58 : 42,
      throttle: .68,
      airborne: true,
      transportCatalogId: vehicleCatalogId,
      transportEntityId: `airport-arrival:${vehicleCatalogId}`,
      airportPassenger: state.role === 'passenger',
      airportTourCenter: center
    }) === 'plane';
    const day = new Date().toISOString().slice(0, 10);
    const event = await appCtx.recordExplorerEvent?.({
      eventId: `airport-arrival:${day}:${Number(destination.lat).toFixed(4)}:${Number(destination.lon).toFixed(4)}`,
      eventType: 'vehicle-route-completed',
      activityId: 'airport-travel',
      pathId: 'travel',
      name: `Arrived by air in ${destination.name}`,
      detail: state.role === 'pilot' ? 'Piloted an airport journey.' : 'Traveled as a passenger and arrived above the destination.',
      family: 'airport-travel',
      sourceId: `${Number(destination.lat).toFixed(4)}:${Number(destination.lon).toFixed(4)}`,
      firstCompletion: true,
      metadata: { vehicleClass: 'aircraft', role: state.role }
    });
    const points = Number(event?.event?.progress?.points || 0);
    appCtx.showToast?.(started
      ? `${destination.name} · ${state.role === 'passenger' ? 'Passenger tour underway. Exit whenever you want to skydive.' : 'You have the controls.'}${points ? ` +${points} Explorer points` : ''}`
      : `Arrived in ${destination.name}.`);
    state.traveling = false;
    return started;
  }

  function open(context = {}) {
    state.vehicle = context.vehicle || null;
    state.selected = null;
    state.results = [];
    refs.results.innerHTML = '';
    refs.local.classList.toggle('show', !!state.vehicle);
    refs.aircraft.textContent = state.vehicle?.catalog?.label || 'Aircraft';
    refs.input.value = '';
    refs.travel.disabled = true;
    refs.status.textContent = 'Search worldwide. These are game journeys, not real airline schedules.';
    setRole('pilot');
    dialog.showModal();
    setTimeout(() => refs.input.focus(), 0);
    return true;
  }

  refs.close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-role]').forEach((button) => button.addEventListener('click', () => setRole(button.dataset.role)));
  refs.search.addEventListener('click', runSearch);
  refs.input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } });
  refs.travel.addEventListener('click', () => void beginJourney());
  refs.flyLocal.addEventListener('click', () => {
    const vehicle = state.vehicle;
    dialog.close();
    if (vehicle) options.enterAircraft?.(vehicle);
  });

  return Object.freeze({
    open,
    dispose() { dialog.remove(); },
    snapshot: () => Object.freeze({ open: dialog.open, role: state.role, selectedDestination: state.selected?.name || '', hasAircraft: !!state.vehicle, traveling: state.traveling })
  });
}

export { createAirportHub };
