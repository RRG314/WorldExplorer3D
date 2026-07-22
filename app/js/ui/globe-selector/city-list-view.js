import { cityLocationLabel } from './helpers.js?v=2';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function selectedStyle(isSelected) {
  return isSelected ? ' style="border-color:#667eea;background:#eef2ff"' : '';
}

export function renderNearbyCityItems(cityList, cities, cityMatchesSelection) {
  if (!cityList) return;
  if (!Array.isArray(cities) || cities.length === 0) {
    cityList.innerHTML = '<li class="globe-selector-city-empty">Pick a point on the globe to see nearby cities.</li>';
    return;
  }
  cityList.innerHTML = cities.map((city, index) => {
    const isSelected = cityMatchesSelection(city);
    const isLive = city.key === 'live-nearby';
    const meta = Number.isFinite(city.distanceKm)
      ? `${isLive ? 'Selected area • ' : ''}${city.distanceKm < 10 ? city.distanceKm.toFixed(1) : city.distanceKm.toFixed(0)} km away`
      : (isLive ? `Nearest mapped place • ${cityLocationLabel(city)}` : cityLocationLabel(city));
    return `<li class="globe-selector-city-item" data-city-source="nearby" data-city-index="${index}"${selectedStyle(isSelected)}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${escapeHtml(city.name)}</span><span class="globe-selector-city-item-meta">${escapeHtml(meta)}</span></div></li>`;
  }).join('');
}

export function renderLibraryCityItems(cityList, presets, saved, cityMatchesSelection) {
  if (!cityList) return;
  if (!presets.length && !saved.length) {
    cityList.innerHTML = '<li class="globe-selector-city-empty">No favorite places yet.</li>';
    return;
  }

  const html = ['<li class="globe-selector-city-section">Curated destinations</li>'];
  presets.forEach((city, index) => {
    html.push(`<li class="globe-selector-city-item" data-city-source="preset" data-city-index="${index}"${selectedStyle(cityMatchesSelection(city))}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${escapeHtml(city.name)}</span><span class="globe-selector-city-item-meta">${escapeHtml(city.category || cityLocationLabel(city))}</span></div></li>`);
  });

  html.push('<li class="globe-selector-city-section">Your saved favorites</li>');
  if (saved.length) {
    saved.forEach((city, index) => {
      html.push(`<li class="globe-selector-city-item" data-city-source="saved" data-city-index="${index}"${selectedStyle(cityMatchesSelection(city))}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${escapeHtml(city.name)}</span><span class="globe-selector-city-item-meta">${escapeHtml(cityLocationLabel(city))}</span></div><button class="globe-selector-city-delete" type="button" data-delete-saved-index="${index}" aria-label="Delete saved favorite ${escapeHtml(city.name)}">Delete</button></li>`);
    });
  } else {
    html.push('<li class="globe-selector-city-empty">Select a place and use the star button to add it.</li>');
  }
  cityList.innerHTML = html.join('');
}

export function bindCityListInteractions(cityList, options = {}) {
  cityList?.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const deleteButton = element?.closest('[data-delete-saved-index]');
    if (deleteButton instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      const index = Number.parseInt(deleteButton.dataset.deleteSavedIndex || '', 10);
      const city = options.getSavedCities?.()[index];
      if (Number.isFinite(index) && index >= 0 && city) options.onDelete?.(city);
      return;
    }

    const target = element?.closest('[data-city-source][data-city-index]');
    if (!(target instanceof HTMLElement)) return;
    const index = Number.parseInt(target.dataset.cityIndex || '', 10);
    if (!Number.isFinite(index) || index < 0) return;
    const city = options.getLists?.()?.[target.dataset.citySource]?.[index];
    if (city) options.onSelect?.(city);
  });
}
