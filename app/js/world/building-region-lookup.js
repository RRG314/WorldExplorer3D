import { BUILDING_REGIONS } from './building-region-data.js';

const cache = new Map();
const CACHE_LIMIT = 64;
const ringCache = new Map();
export function decodeBuildingRegionRing(encoded) {
  const values=[];let offset=0,x=0,y=0;
  const read=()=>{let result=0,shift=0,byte;do{byte=encoded.charCodeAt(offset++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>>1):result>>>1;};
  while(offset<encoded.length){x+=read();y+=read();values.push(x/1e5,y/1e5);}
  return new Float64Array(values);
}
function contains(encoded, lon, lat) {
  let ring=ringCache.get(encoded);
  if(!ring){ring=decodeBuildingRegionRing(encoded);if(ringCache.size>=32)ringCache.delete(ringCache.keys().next().value);ringCache.set(encoded,ring);}
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i+=2) {
    const ax=ring[i],ay=ring[i+1],bx=ring[j],by=ring[j+1];
    if ((ay > lat) !== (by > lat) &&
        lon < (bx - ax) * (lat - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function buildingRegionCountry(location = {}) {
  const explicit = String(location.countryCode || location.country_code ||
    location.locationDetails?.countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;
  const lat = location.lat, lon = location.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return '';
  const key = `${lat}:${lon}`;
  if (cache.has(key)) return cache.get(key);
  let code = '';
  for (const region of BUILDING_REGIONS) {
    if (region.polygons.some(({bounds, rings}) =>
      lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3] &&
      contains(rings[0], lon, lat) && !rings.slice(1).some(ring => contains(ring, lon, lat)))) {
      code = region.code;
      break;
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, code);
  return code;
}
