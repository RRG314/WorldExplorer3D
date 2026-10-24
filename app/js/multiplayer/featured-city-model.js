import { LOCS } from '../earth-core/location-catalog.js';

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
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

function getWeeklyFeaturedCity(date = new Date()) {
  const week = isoWeekNumber(date);
  const selected = WEEKLY_CITY_ROTATION[week % WEEKLY_CITY_ROTATION.length];
  const thursday = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
  const year=thursday.getUTCFullYear(),cityKey=normalizeFeaturedCityKey(selected.city);
  const location=Object.values(LOCS).find(place=>normalizeFeaturedCityKey(place.name)===cityKey);
  if(!location)throw new Error('Weekly city has no canonical location.');
  return {week,year,weekKey:`${year}-W${String(week).padStart(2,'0')}`,city:selected.city,kind:selected.kind,cityKey,lat:location.lat,lon:location.lon};
}

function getWeeklyEventMessage(date = new Date()) {
  const featured = getWeeklyFeaturedCity(date);
  const fridayPush = date.getUTCDay() === 5
    ? `Explore ${featured.city} with others today.`
    : `Explore ${featured.city} with others this Friday.`;
  return { featured, message: fridayPush };
}

export { WEEKLY_CITY_ROTATION, getWeeklyEventMessage, getWeeklyFeaturedCity, isoWeekNumber, normalizeFeaturedCityKey };

// W-prefixed codes are reserved for system-created weekly rooms. Old rooms
// remain readable; a different ISO year gets a different deterministic code.
export function weeklyRoomCode(selection) {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value=selection.year*64+selection.week,code='W';
  for(let i=0;i<5;i++){code+=alphabet[value%alphabet.length];value=Math.floor(value/alphabet.length);}
  return code;
}
export function weeklyRoomDescriptor(date=new Date()) {
  const weekly=getWeeklyFeaturedCity(date);
  return {...weekly,code:weeklyRoomCode(weekly),world:{kind:'earth',lat:weekly.lat,lon:weekly.lon,seed:`latlon:${weekly.lat.toFixed(5)},${weekly.lon.toFixed(5)}`}};
}
