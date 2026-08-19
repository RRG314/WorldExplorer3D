import { cityLocationLabel } from './helpers.js?v=8';

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

function pushCityRows(html, cities, source, cityMatchesSelection, { removable = false } = {}) {
  cities.forEach((city, index) => {
    const remove = removable
      ? `<button class="globe-selector-city-delete" type="button" data-delete-saved-index="${index}" aria-label="Remove ${escapeHtml(city.name)} from saved places">Remove</button>`
      : '';
    html.push(`<li class="globe-selector-city-item" data-city-source="${source}" data-city-index="${index}"${selectedStyle(cityMatchesSelection(city))}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${escapeHtml(city.name)}</span><span class="globe-selector-city-item-meta">${escapeHtml(city.category || cityLocationLabel(city))}</span></div>${remove}</li>`);
  });
}

export function renderLibraryCityItems(cityList, presets, saved, recent, cityMatchesSelection) {
  if (!cityList) return;
  if (!presets.length && !saved.length && !recent.length) {
    cityList.innerHTML = '<li class="globe-selector-city-empty">No places are available yet.</li>';
    return;
  }

  const majorCities = presets.filter((city) => city.collection === 'major-city');
  const destinations = presets.filter((city) => city.collection !== 'major-city');
  const historicSites = destinations.filter((city) => /historic|landmark/i.test(city.category));
  const naturalPlaces = destinations.filter((city) => !historicSites.includes(city));
  const html = ['<li class="globe-selector-city-section"><strong>Saved Places</strong><span>Your personal collection</span></li>'];
  if (saved.length) {
    pushCityRows(html, saved, 'saved', cityMatchesSelection, { removable: true });
  } else {
    html.push('<li class="globe-selector-city-empty">Select a place and use the star to save it.</li>');
  }
  html.push('<li class="globe-selector-city-section"><strong>Recent</strong><span>Locations you explored</span></li>');
  if (recent.length) pushCityRows(html, recent, 'recent', cityMatchesSelection);
  else html.push('<li class="globe-selector-city-empty">Your explored locations will appear here.</li>');
  html.push('<li class="globe-selector-city-section"><strong>Major Cities</strong><span>Global city collection</span></li>');
  pushCityRows(html, majorCities, 'preset', cityMatchesSelection);
  html.push('<li class="globe-selector-city-section"><strong>Historic Sites & Landmarks</strong><span>Architecture, monuments, and cultural sites</span></li>');
  pushCityRows(html, historicSites, 'preset', cityMatchesSelection);
  html.push('<li class="globe-selector-city-section"><strong>Nature & Landscapes</strong><span>Parks, mountains, coastlines, and natural wonders</span></li>');
  pushCityRows(html, naturalPlaces, 'preset', cityMatchesSelection);
  cityList.innerHTML = html.join('');
}

export function renderPresetCityItems(cityList, cities, cityMatchesSelection) {
  if (!cityList) return;
  if (!Array.isArray(cities) || cities.length === 0) {
    cityList.innerHTML = '<li class="globe-selector-city-empty">No featured cities are available.</li>';
    return;
  }
  const html = [];
  pushCityRows(html, cities, 'preset', cityMatchesSelection);
  cityList.innerHTML = html.join('');
}

export function bindCityListInteractions(cityList, options = {}) {
  let lastClickKey = '';
  let lastClickAt = 0;
  const resolveCity = (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-delete-saved-index]')) return null;
    const target = element?.closest('[data-city-source][data-city-index]');
    if (!(target instanceof HTMLElement)) return null;
    const index = Number.parseInt(target.dataset.cityIndex || '', 10);
    if (!Number.isFinite(index) || index < 0) return null;
    return options.getLists?.()?.[target.dataset.citySource]?.[index] || null;
  };

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

    const city = resolveCity(event);
    if (city) {
      const target = element?.closest('[data-city-source][data-city-index]');
      const clickKey = target instanceof HTMLElement
        ? `${target.dataset.citySource || ''}:${target.dataset.cityIndex || ''}`
        : '';
      const clickedAt = performance.now();
      const isDoubleClick = !!clickKey && clickKey === lastClickKey && clickedAt - lastClickAt <= 450;
      lastClickKey = clickKey;
      lastClickAt = clickedAt;
      options.onSelect?.(city);
      if (isDoubleClick) options.onActivate?.(city);
    }
  });

  cityList?.addEventListener('dblclick', (event) => {
    const city = resolveCity(event);
    if (!city) return;
    event.preventDefault();
    options.onActivate?.(city);
  });
}
