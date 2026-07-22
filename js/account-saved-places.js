import {
  FAVORITE_STORAGE_KEY,
  loadSavedFavoriteCities
} from '../app/js/ui/globe-selector/helpers.js';

const list = document.getElementById('savedPlacesList');
const status = document.getElementById('savedPlacesStatus');

function coordinatesLabel(place) {
  return `${Number(place.lat).toFixed(4)}, ${Number(place.lon).toFixed(4)}`;
}

function renderSavedPlaces() {
  if (!list || !status) return;
  list.replaceChildren();

  const places = loadSavedFavoriteCities();
  if (!places.length) {
    const empty = document.createElement('div');
    empty.className = 'receipt-empty';
    empty.textContent = 'No places saved in this browser yet.';
    list.appendChild(empty);
    status.textContent = 'Saved places stay in this browser unless a future sync option is explicitly enabled.';
    return;
  }

  places.forEach((place) => {
    const row = document.createElement('article');
    row.className = 'saved-place';

    const name = document.createElement('strong');
    name.textContent = String(place.name || 'Saved place');

    const coordinates = document.createElement('span');
    coordinates.textContent = coordinatesLabel(place);

    row.append(name, coordinates);
    list.appendChild(row);
  });

  status.textContent = `${places.length} saved place${places.length === 1 ? '' : 's'} in this browser. These are local favorites, not cloud account data.`;
}

window.addEventListener('storage', (event) => {
  if (event.key === FAVORITE_STORAGE_KEY) renderSavedPlaces();
});

renderSavedPlaces();
