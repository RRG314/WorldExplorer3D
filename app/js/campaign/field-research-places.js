const supported = place => place && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180;
export function fieldResearchPlaces(careerId, {profile, context = {}} = {}) {
  const active = profile?.researchCareers?.[careerId]?.active;
  if (active && active.phase !== 'complete') {
    const destination = active.site?.locationContext || active.site?.location;
    return supported(destination) ? [{id: 'saved-' + careerId + '-course', environment: 'earth', ...destination, name: destination.name || active.site.name}] : [];
  }
  const places = [{id: careerId + '-druid-hill', name: 'Druid Hill Park', lat: 39.3189, lon: -76.6363, environment: 'earth'}];
  const selected = context.place;
  if (context.environment === 'earth' && supported(selected) && !places.some(row => Math.abs(row.lat - selected.lat) < .00001 && Math.abs(row.lon - selected.lon) < .00001)) places.push({...selected, id: 'selected-' + careerId + '-location', environment: 'earth'});
  return places;
}
export function fieldResearchSiteDescriptor(careerId, place) {
  if (!supported(place)) throw Error('Choose a supported Earth location.');
  return {id: `virtual-${careerId}:${place.lat.toFixed(5)},${place.lon.toFixed(5)}`, name: `${place.name || 'Selected location'} · fictional ${careerId} training site`, location: place};
}
