const WEEKLY_CITY_ROTATION = Object.freeze([
  { city: 'Tokyo', kind: 'earth' },
  { city: 'Paris', kind: 'earth' },
  { city: 'Baltimore', kind: 'earth' },
  { city: 'Monaco', kind: 'earth' },
  { city: 'New York', kind: 'earth' },
  { city: 'Miami', kind: 'earth' },
  { city: 'London', kind: 'earth' },
  { city: 'Dubai', kind: 'earth' },
  { city: 'San Francisco', kind: 'earth' },
  { city: 'Los Angeles', kind: 'earth' },
  { city: 'Chicago', kind: 'earth' },
  { city: 'Seattle', kind: 'earth' },
  { city: 'Hollywood', kind: 'earth' },
  { city: 'Nürburgring', kind: 'earth' },
  { city: 'Las Vegas', kind: 'earth' }
]);

function normalizeFeaturedCityKey(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function isoWeekNumber(date = new Date()) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

function getWeeklyFeaturedCity(date = new Date()) {
  const week = isoWeekNumber(date);
  const selected = WEEKLY_CITY_ROTATION[week % WEEKLY_CITY_ROTATION.length];
  return { week, city: selected.city, kind: selected.kind, cityKey: normalizeFeaturedCityKey(selected.city) };
}

function getWeeklyEventMessage(date = new Date()) {
  const featured = getWeeklyFeaturedCity(date);
  const fridayPush = date.getDay() === 5
    ? `Explore ${featured.city} with others today.`
    : `Explore ${featured.city} with others this Friday.`;
  return { featured, message: fridayPush };
}

export { WEEKLY_CITY_ROTATION, getWeeklyEventMessage, getWeeklyFeaturedCity, isoWeekNumber, normalizeFeaturedCityKey };
