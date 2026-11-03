const supported = (place) =>
  place &&
  Number.isFinite(place.lat) &&
  Math.abs(place.lat) <= 90 &&
  Number.isFinite(place.lon) &&
  Math.abs(place.lon) <= 180;
export function fieldResearchPlaces(
  careerId,
  { profile, context = {}, variantId = 'campaign' } = {}
) {
  const state = profile?.researchCareers?.[careerId],
    active = state?.active;
  const saved =
    careerId === 'botany' && (!active || active.phase === 'complete')
      ? state?.records?.[variantId]
      : null;
  if (saved || (active && active.phase !== 'complete')) {
    const site = (saved || active).site,
      destination = site?.locationContext || site?.location;
    return supported(destination)
      ? [
          {
            id: 'saved-' + careerId + '-course',
            environment: 'earth',
            ...destination,
            name: destination.name || site.name
          }
        ]
      : [];
  }
  // Wildlife needs an admitted park cell: the older field-course arrival is
  // beside the reservoir. Other careers and all saved destinations retain it.
  const destination = ['wildlife', 'botany'].includes(careerId)
    ? { name: 'Druid Hill Park · park lawns', lat: 39.3173, lon: -76.64044 }
    : { name: 'Druid Hill Park', lat: 39.3189, lon: -76.6363 };
  const places = [{ id: careerId + '-druid-hill', ...destination, environment: 'earth' }];
  const selected = context.place;
  if (
    context.environment === 'earth' &&
    supported(selected) &&
    !places.some(
      (row) =>
        Math.abs(row.lat - selected.lat) < 0.00001 && Math.abs(row.lon - selected.lon) < 0.00001
    )
  )
    places.push({ ...selected, id: 'selected-' + careerId + '-location', environment: 'earth' });
  return places;
}
export function fieldResearchSiteDescriptor(careerId, place) {
  if (!supported(place)) throw Error('Choose a supported Earth location.');
  return {
    id: `virtual-${careerId}:${place.lat.toFixed(5)},${place.lon.toFixed(5)}`,
    name: `${place.name || 'Selected location'} · fictional ${careerId} training site`,
    location: place
  };
}
