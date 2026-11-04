const recommended = Object.freeze({
  id: 'druid-hill-geology', name: 'Druid Hill Park',
  lat: 39.3189, lon: -76.6363, environment: 'earth'
});

function supported(point) {
  return point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lon) && Math.abs(point.lon) <= 180;
}

// An unfinished investigation keeps its accepted destination. New virtual
// courses may also use the selected Earth location; physical admission still
// happens after travel through the existing ground/collision owner.
export function geologyStartingPlaces({profile, context = {}} = {}) {
  const active = profile?.researchCareers?.geology?.active;
  if (active && active.phase !== 'complete' && supported(active.site?.location)) {
    const destination = supported(active.site.locationContext)
      ? active.site.locationContext : active.site.location;
    return [{
      id: 'saved-geology-course', name: destination.name || active.site.name,
      lat: destination.lat, lon: destination.lon, environment: 'earth'
    }];
  }
  const places = [{...recommended}], selected = context.place;
  if (context.environment === 'earth' && supported(selected) &&
      (Math.abs(selected.lat - recommended.lat) > .00001 ||
       Math.abs(selected.lon - recommended.lon) > .00001)) {
    places.push({
      id: 'selected-geology-location', name: selected.name || 'Selected location',
      lat: selected.lat, lon: selected.lon, environment: 'earth'
    });
  }
  return places;
}

export function geologySiteDescriptor(place) {
  if (!supported(place)) throw new Error('Choose a supported Earth location.');
  return {
    id: `virtual-geology:${place.lat.toFixed(5)},${place.lon.toFixed(5)}`,
    name: `${place.name || 'Selected location'} · virtual geology field course`,
    location: place
  };
}
