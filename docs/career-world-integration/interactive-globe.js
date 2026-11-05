import { createGlobeSelectorScene } from '../../app/js/ui/globe-selector/scene.js?v=22';
import { searchPlaces } from '../../app/js/places/place-search.js?v=4';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const coordinates = (place) => `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;

// One page-owned host, one original scene controller. Reopening retains its
// input bindings; the native renderer/tile/observer owners are released on exit.
export function createInteractiveGlobe({ onUse, onCancel }) {
  const root = document.createElement('section');
  root.className = 'destination-picker';
  root.innerHTML = `<header class="destination-heading"><div><span class="eyebrow">THE WORLD IS OPEN</span><h1>Where to next?</h1></div><button data-place-cancel>← Back</button></header>
    <form class="destination-search"><label for="destinationQuery">Find a place or enter coordinates</label><div><input id="destinationQuery" type="search" placeholder="City, address, or latitude, longitude" autocomplete="off"><button class="primary" type="submit">Search</button></div></form>
    <p class="destination-status" role="status" aria-live="polite"></p><div class="destination-results" aria-label="Search results" hidden></div>
    <div class="destination-layout"><div class="destination-map-column"><div class="destination-map-tools"><div><button data-map="map" type="button">Map</button><button data-map="satellite" type="button">Satellite</button></div><div><button data-zoom="out" type="button" aria-label="Zoom out">−</button><button data-zoom="in" type="button" aria-label="Zoom in">+</button><button data-overview type="button">Whole globe</button></div></div><div class="destination-globe-stage"><canvas aria-label="Interactive Earth. Drag to rotate; click to select a place. Use search or coordinates for keyboard selection."></canvas></div><div class="destination-map-caption"><span data-scale></span><span data-attribution></span></div><p class="destination-gesture-hint">Drag to rotate · Click to choose · Scroll or pinch to zoom</p></div>
    <aside class="destination-details"><span class="eyebrow">YOUR STARTING PLACE</span><h2 data-place-name></h2><p data-place-coordinates></p><p>Choose any point on Earth. A career suggests activities; it never limits where you can go.</p><button class="primary" data-use-place>Choose this place →</button><button data-locate>Use my location</button><details><summary>Enter exact coordinates</summary><form class="destination-coordinates"><label>Latitude<input name="lat" type="number" required min="-90" max="90" step="any"></label><label>Longitude<input name="lon" type="number" required min="-180" max="180" step="any"></label><button type="submit">Show this point</button></form></details></aside></div>`;
  const $ = (selector) => root.querySelector(selector);
  let open = false,
    generation = 0,
    searchController = null,
    results = [];
  const defaultPlace = {
    name: 'Baltimore',
    lat: 39.2904,
    lon: -76.6122,
    world: 'earth',
    image: 'walking-a8119ad855de.webp',
  };
  let selected = { ...defaultPlace };
  const scene = createGlobeSelectorScene({
    appCtx: {},
    canvas: $('canvas'),
    stage: $('.destination-globe-stage'),
    zoomInBtn: $('[data-zoom=in]'),
    zoomOutBtn: $('[data-zoom=out]'),
    scaleReadout: $('[data-scale]'),
    mapBasemapBtn: $('[data-map=map]'),
    satelliteBasemapBtn: $('[data-map=satellite]'),
    basemapAttribution: $('[data-attribution]'),
    placeReadout: $('[data-place-name]'),
    getActiveCityTab: () => 'nearby',
    getPanelMode: () => 'choose',
    getOpenState: () => open,
    cityMatchesSelection: () => false,
    onGlobePick: (point) => {
      searchController?.abort();
      $('.destination-results').hidden = true;
      select({ ...point, name: `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` }, false);
      $('#destinationQuery').value = coordinates(selected);
      status('Starting place updated.');
    },
  });
  function status(text) {
    $('.destination-status').textContent = text;
  }
  function select(place, focus = true) {
    const lat = Number(place.lat),
      lon = Number(place.lon);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    )
      return false;
    selected = { ...place, lat, lon, world: 'earth', image: 'walking-a8119ad855de.webp' };
    $('[data-place-name]').textContent = selected.name || coordinates(selected);
    $('[data-place-coordinates]').textContent = coordinates(selected);
    $('[name=lat]').value = lat;
    $('[name=lon]').value = lon;
    scene.setSelectionMarker(selected);
    if (focus) scene.focusOnSelection(lat, lon);
    return true;
  }
  $('.destination-search').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = $('#destinationQuery').value.trim();
    if (!query) {
      status('Enter a place or latitude, longitude.');
      return;
    }
    // Reject coordinate-looking input before it can become a provider query.
    if (
      /^[\d\s.,+−-]+$/.test(query) &&
      !/^\s*-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?\s*$/.test(query)
    ) {
      status('Use latitude, longitude. Latitude must be −90 to 90; longitude −180 to 180.');
      return;
    }
    const pair = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (pair && (Math.abs(Number(pair[1])) > 90 || Math.abs(Number(pair[2])) > 180)) {
      status('Latitude must be −90 to 90; longitude −180 to 180.');
      return;
    }
    searchController?.abort();
    const request = (searchController = new AbortController()),
      version = generation;
    status('Finding places…');
    $('.destination-results').hidden = true;
    try {
      const found = await searchPlaces(query, { signal: request.signal });
      if (!open || version !== generation || request.signal.aborted) return;
      results = found;
      $('.destination-results').innerHTML = found
        .map(
          (p, i) =>
            `<button data-place-result="${i}"><strong>${escape(p.name)}</strong><small>${escape(p.displayName)} · ${coordinates(p)}</small></button>`
        )
        .join('');
      $('.destination-results').hidden = !found.length;
      if (found.length === 1) select(found[0]);
      status(
        found.length
          ? `${found.length} ${found.length === 1 ? 'place found. Selected below.' : 'places found. Choose a result.'}`
          : 'No places found. Try another name, coordinates, or choose directly on the globe.'
      );
    } catch (error) {
      if (version !== generation || request.signal.aborted) return;
      status(
        'Place-name search is unavailable in this local preview. Choose anywhere on the globe or enter coordinates.'
      );
    }
  });
  $('.destination-coordinates').addEventListener('submit', (event) => {
    event.preventDefault();
    const lat = Number($('[name=lat]').value),
      lon = Number($('[name=lon]').value);
    if (select({ lat, lon, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }))
      status('Starting place updated.');
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-place-result'))
      select(results[Number(button.dataset.placeResult)]);
    if (button.hasAttribute('data-use-place')) onUse({ ...selected });
    if (button.hasAttribute('data-place-cancel')) onCancel();
    if (button.hasAttribute('data-overview')) {
      scene.setCameraDistance(3.2);
      scene.focusOnSelection(selected.lat, selected.lon);
    }
    if (button.hasAttribute('data-locate')) {
      const version = generation;
      if (!navigator.geolocation) {
        status('Location is unavailable. Search or select on the globe.');
        return;
      }
      status('Waiting for your location permission…');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!open || version !== generation) return;
          select({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            name: 'My location',
          });
          status('Your current location is selected.');
        },
        () => {
          if (open && version === generation)
            status('Location was not available. Search or select on the globe.');
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    }
  });
  return {
    mount(host, place) {
      host.append(root);
      if (open) {
        scene.ensureSize();
        return;
      }
      open = true;
      generation++;
      scene.init();
      scene.setCameraDistance(3.2);
      select(place || selected);
      scene.startRenderLoop();
      $('#destinationQuery').value = selected.name || coordinates(selected);
      $('.destination-results').hidden = true;
      status('Choose anywhere. Your starting place stays with your Explorer.');
    },
    unmount() {
      if (!open) return;
      open = false;
      generation++;
      searchController?.abort();
      searchController = null;
      scene.destroy();
      root.remove();
    },
    reset() {
      selected = { ...defaultPlace };
    },
    snapshot: () => ({
      open,
      selection: { ...selected },
      zoom: scene.getZoomState(),
      render: scene.getRenderStats(),
      basemap: scene.getBasemapState(),
      rotation: scene.getBridgeRefs().globeRoot?.rotation.toArray().slice(0, 3) || null,
    }),
  };
}
