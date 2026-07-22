import { distanceKmBetween, normalizeCityRecord } from './helpers.js?v=2';

const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

export const CURATED_DESTINATIONS = [
  ['great-pyramids', 'Great Pyramids of Giza', 29.9792, 31.1342, 'Landmark'],
  ['grand-canyon', 'Grand Canyon', 36.1069, -112.1129, 'Natural wonder'],
  ['golden-gate', 'Golden Gate Bridge', 37.8199, -122.4783, 'Landmark'],
  ['great-barrier-reef', 'Great Barrier Reef', -18.2871, 147.6992, 'Ocean'],
  ['mount-everest', 'Mount Everest', 27.9881, 86.925, 'Mountain'],
  ['victoria-falls', 'Victoria Falls', -17.9243, 25.8572, 'Natural wonder'],
  ['serengeti', 'Serengeti National Park', -2.3333, 34.8333, 'Wildlife'],
  ['amazon', 'Amazon Rainforest', -3.4653, -62.2159, 'Rainforest'],
  ['sahara', 'Sahara Desert', 23.4162, 25.6628, 'Desert'],
  ['machu-picchu', 'Machu Picchu', -13.1631, -72.545, 'Historic site'],
  ['easter-island', 'Rapa Nui', -27.1127, -109.3497, 'Historic site'],
  ['antarctica', 'Antarctic Peninsula', -64.774, -64.053, 'Polar'],
  ['niagara-falls', 'Niagara Falls', 43.0962, -79.0377, 'Natural wonder'],
  ['yellowstone', 'Yellowstone National Park', 44.428, -110.5885, 'National park'],
  ['yosemite', 'Yosemite Valley', 37.7459, -119.5332, 'National park'],
  ['hawaii-volcanoes', 'Hawaii Volcanoes', 19.4194, -155.2885, 'Volcanic'],
  ['fjord', 'Geirangerfjord', 62.1015, 7.0941, 'Fjord'],
  ['alps', 'Swiss Alps', 46.559, 8.561, 'Mountain'],
  ['iceland', 'Iceland Highlands', 64.9631, -19.0208, 'Volcanic'],
  ['petra', 'Petra', 30.3285, 35.4444, 'Historic site'],
  ['angkor-wat', 'Angkor Wat', 13.4125, 103.867, 'Historic site'],
  ['taj-mahal', 'Taj Mahal', 27.1751, 78.0421, 'Landmark'],
  ['great-wall', 'Great Wall of China', 40.4319, 116.5704, 'Historic site'],
  ['fuji', 'Mount Fuji', 35.3606, 138.7274, 'Mountain'],
  ['ha-long-bay', 'Ha Long Bay', 20.9101, 107.1839, 'Coast'],
  ['bora-bora', 'Bora Bora', -16.5004, -151.7415, 'Island'],
  ['galapagos', 'Galapagos Islands', -0.9538, -90.9656, 'Wildlife'],
  ['banff', 'Banff National Park', 51.1784, -115.5708, 'National park'],
  ['uluru', 'Uluru', -25.3444, 131.0369, 'Landmark'],
  ['table-mountain', 'Table Mountain', -33.9628, 18.4098, 'Mountain']
].map(([key, name, lat, lon, category]) => ({ key, name, lat, lon, category, source: 'curated' }));

const nearbyCache = new Map();

function nearbyCacheKey(lat, lon) {
  return `${Number(lat).toFixed(1)},${Number(lon).toFixed(1)}`;
}

function parseNearbyElements(elements, lat, lon) {
  return (Array.isArray(elements) ? elements : [])
    .map((element) => {
      const city = normalizeCityRecord({
        key: `osm-${element?.type || 'node'}-${element?.id || ''}`,
        name: element?.tags?.name || element?.tags?.['name:en'],
        lat: element?.lat ?? element?.center?.lat,
        lon: element?.lon ?? element?.center?.lon
      }, 'live');
      if (!city) return null;
      return {
        ...city,
        placeType: String(element?.tags?.place || 'place'),
        distanceKm: distanceKmBetween(lat, lon, city.lat, city.lon)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 8);
}

async function fetchFromEndpoint(endpoint, query, signal) {
  const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`Nearby places HTTP ${response.status}`);
  return response.json();
}

export async function fetchNearbyCities(lat, lon, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const key = nearbyCacheKey(lat, lon);
  if (nearbyCache.has(key)) return nearbyCache.get(key);

  const query = `[out:json][timeout:8];node(around:25000,${lat.toFixed(5)},${lon.toFixed(5)})["place"~"^(city|town)$"]["name"];out body 24;`;
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const payload = await fetchFromEndpoint(endpoint, query, options.signal);
      const cities = parseNearbyElements(payload?.elements, lat, lon);
      nearbyCache.set(key, cities);
      return cities;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Nearby places unavailable');
}
