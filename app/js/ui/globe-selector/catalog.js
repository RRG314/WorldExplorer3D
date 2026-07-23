import { distanceKmBetween, normalizeCityRecord } from './helpers.js?v=4';

const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

export const CURATED_DESTINATIONS = [
  ['great-pyramids', 'Great Pyramids of Giza', 29.9792, 31.1342, 'Landmark'],
  ['grand-canyon', 'Grand Canyon', 36.1069, -112.1129, 'Natural wonder'],
  ['golden-gate', 'Golden Gate Bridge', 37.8115, -122.4774, 'Landmark'],
  ['great-barrier-reef', 'Great Barrier Reef', -18.2871, 147.6992, 'Ocean'],
  ['mount-everest', 'Mount Everest', 27.9881, 86.925, 'Mountain'],
  ['victoria-falls', 'Victoria Falls', -17.9243, 25.8572, 'Natural wonder'],
  ['serengeti', 'Serengeti National Park', -2.3333, 34.8333, 'Wildlife'],
  ['amazon', 'Amazon Rainforest River Bank', -2.6500, -60.9120, 'Rio Negro rainforest bank'],
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
  ['table-mountain', 'Table Mountain', -33.9628, 18.4098, 'Mountain'],
  ['acropolis', 'Acropolis of Athens', 37.9715, 23.7257, 'Historic site'],
  ['alhambra', 'Alhambra', 37.1761, -3.5881, 'Historic site'],
  ['chichen-itza', 'Chichen Itza', 20.6843, -88.5678, 'Historic site'],
  ['colosseum', 'Colosseum', 41.8902, 12.4922, 'Historic site'],
  ['eiffel-tower', 'Eiffel Tower', 48.8584, 2.2945, 'Landmark'],
  ['forbidden-city', 'Forbidden City', 39.9163, 116.3972, 'Historic site'],
  ['hagiasophia', 'Hagia Sophia', 41.0086, 28.9802, 'Historic site'],
  ['moai-rano-raraku', 'Rano Raraku Moai', -27.1239, -109.2868, 'Historic site'],
  ['stonehenge', 'Stonehenge', 51.1789, -1.8262, 'Historic site'],
  ['sydney-opera-house', 'Sydney Opera House', -33.8568, 151.2153, 'Landmark'],
  ['statue-of-liberty', 'Statue of Liberty', 40.6892, -74.0445, 'Landmark'],
  ['temple-karnak', 'Karnak Temple Complex', 25.7188, 32.6573, 'Historic site'],
  ['torres-del-paine', 'Torres del Paine', -50.9423, -73.4068, 'National park'],
  ['zhangjiajie', 'Zhangjiajie National Forest', 29.3167, 110.4333, 'National park']
].map(([key, name, lat, lon, category]) => ({ key, name, lat, lon, category, source: 'curated' }));

export const MAJOR_CITY_DESTINATIONS = [
  ['new-york', 'New York', 40.7128, -74.0060, 'North America'],
  ['washington-dc', 'Washington, DC', 38.9072, -77.0369, 'North America'],
  ['philadelphia', 'Philadelphia', 39.9526, -75.1652, 'North America'],
  ['boston', 'Boston', 42.3601, -71.0589, 'North America'],
  ['los-angeles', 'Los Angeles', 34.0522, -118.2437, 'North America'],
  ['chicago', 'Chicago', 41.8781, -87.6298, 'North America'],
  ['miami', 'Miami', 25.7617, -80.1918, 'North America'],
  ['san-francisco', 'San Francisco', 37.7749, -122.4194, 'North America'],
  ['seattle', 'Seattle', 47.6062, -122.3321, 'North America'],
  ['vancouver', 'Vancouver', 49.2827, -123.1207, 'North America'],
  ['toronto', 'Toronto', 43.6532, -79.3832, 'North America'],
  ['mexico-city', 'Mexico City', 19.4326, -99.1332, 'North America'],
  ['montreal', 'Montreal', 45.5019, -73.5674, 'North America'],
  ['new-orleans', 'New Orleans', 29.9511, -90.0715, 'North America'],
  ['san-diego', 'San Diego', 32.7157, -117.1611, 'North America'],
  ['sao-paulo', 'Sao Paulo', -23.5505, -46.6333, 'South America'],
  ['rio-de-janeiro', 'Rio de Janeiro', -22.9068, -43.1729, 'South America'],
  ['buenos-aires', 'Buenos Aires', -34.6037, -58.3816, 'South America'],
  ['bogota', 'Bogota', 4.7110, -74.0721, 'South America'],
  ['lima', 'Lima', -12.0464, -77.0428, 'South America'],
  ['london', 'London', 51.5074, -0.1278, 'Europe'],
  ['paris', 'Paris', 48.8566, 2.3522, 'Europe'],
  ['berlin', 'Berlin', 52.5200, 13.4050, 'Europe'],
  ['rome', 'Rome', 41.9028, 12.4964, 'Europe'],
  ['madrid', 'Madrid', 40.4168, -3.7038, 'Europe'],
  ['monaco', 'Monaco', 43.7384, 7.4246, 'Europe'],
  ['amsterdam', 'Amsterdam', 52.3676, 4.9041, 'Europe'],
  ['athens', 'Athens', 37.9838, 23.7275, 'Europe'],
  ['barcelona', 'Barcelona', 41.3874, 2.1686, 'Europe'],
  ['istanbul', 'Istanbul', 41.0082, 28.9784, 'Europe'],
  ['prague', 'Prague', 50.0755, 14.4378, 'Europe'],
  ['cairo', 'Cairo', 30.0444, 31.2357, 'Africa'],
  ['lagos', 'Lagos', 6.5244, 3.3792, 'Africa'],
  ['cape-town', 'Cape Town', -33.9249, 18.4241, 'Africa'],
  ['nairobi', 'Nairobi', -1.2921, 36.8219, 'Africa'],
  ['addis-ababa', 'Addis Ababa', 8.9806, 38.7578, 'Africa'],
  ['marrakesh', 'Marrakesh', 31.6295, -7.9811, 'Africa'],
  ['dubai', 'Dubai', 25.2048, 55.2708, 'Middle East'],
  ['riyadh', 'Riyadh', 24.7136, 46.6753, 'Middle East'],
  ['jerusalem', 'Jerusalem', 31.7683, 35.2137, 'Middle East'],
  ['mumbai', 'Mumbai', 19.0760, 72.8777, 'Asia'],
  ['delhi', 'Delhi', 28.6139, 77.2090, 'Asia'],
  ['singapore', 'Singapore', 1.3521, 103.8198, 'Asia'],
  ['tokyo', 'Tokyo', 35.6762, 139.6503, 'Asia'],
  ['seoul', 'Seoul', 37.5665, 126.9780, 'Asia'],
  ['beijing', 'Beijing', 39.9042, 116.4074, 'Asia'],
  ['shanghai', 'Shanghai', 31.2304, 121.4737, 'Asia'],
  ['bangkok', 'Bangkok', 13.7563, 100.5018, 'Asia'],
  ['hong-kong', 'Hong Kong', 22.3193, 114.1694, 'Asia'],
  ['kyoto', 'Kyoto', 35.0116, 135.7681, 'Asia'],
  ['sydney', 'Sydney', -33.8688, 151.2093, 'Oceania'],
  ['melbourne', 'Melbourne', -37.8136, 144.9631, 'Oceania'],
  ['auckland', 'Auckland', -36.8509, 174.7645, 'Oceania']
].map(([key, name, lat, lon, region]) => ({
  key: `major-${key}`,
  name,
  lat,
  lon,
  category: region,
  collection: 'major-city',
  source: 'curated'
}));

const nearbyCache = new Map();

export function nearbyMajorCities(lat, lon) {
  return MAJOR_CITY_DESTINATIONS
    .map((city) => ({ ...city, distanceKm: distanceKmBetween(lat, lon, city.lat, city.lon) }))
    .filter((city) => city.distanceKm <= 160.934)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function mergeNearbyCities(primary, fallback) {
  const seen = new Set();
  return [...primary, ...fallback].filter((city) => {
    const key = String(city.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
      const population = Number.parseInt(String(element?.tags?.population || '').replaceAll(',', ''), 10);
      return {
        ...city,
        placeType: String(element?.tags?.place || 'place'),
        distanceKm: distanceKmBetween(lat, lon, city.lat, city.lon),
        population: Number.isFinite(population) ? population : 0
      };
    })
    .filter(Boolean)
    .filter((city) => city.distanceKm <= 160.934)
    .sort((a, b) => {
      const populationDelta = Number(b.population || 0) - Number(a.population || 0);
      if (populationDelta) return populationDelta;
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, 12);
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
  const fallbackCities = nearbyMajorCities(lat, lon);

  const query = `[out:json][timeout:12];node(around:160934,${lat.toFixed(5)},${lon.toFixed(5)})["place"="city"]["name"];out body 80;`;
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const payload = await fetchFromEndpoint(endpoint, query, options.signal);
      const cities = mergeNearbyCities(parseNearbyElements(payload?.elements, lat, lon), fallbackCities);
      nearbyCache.set(key, cities);
      return cities;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }
  if (lastError && options.signal?.aborted) throw lastError;
  nearbyCache.set(key, fallbackCities);
  return fallbackCities;
}
