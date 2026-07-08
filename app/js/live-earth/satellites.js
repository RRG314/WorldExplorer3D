const SATELLITE_JS_URL = 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/+esm';
const SATELLITE_REFRESH_MS = 30 * 60 * 1000;
const FEED_FETCH_TIMEOUT_MS = 3200;
const EARTH_RADIUS_KM = 6378.137;
const FALLBACK_ORBIT_EPOCH_MS = Date.UTC(2026, 2, 16, 0, 0, 0);

const FEED_URLS = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  weather: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  resource: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle',
  science: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle'
};

const CURATED_SATELLITES = [
  {
    id: 'iss',
    label: 'ISS',
    source: 'stations',
    matcher: (name) => /ISS \(ZARYA\)/i.test(name),
    classLabel: 'Station',
    operator: 'International',
    description: 'Crewed low-Earth orbit laboratory.'
  },
  {
    id: 'tiangong',
    label: 'Tiangong',
    source: 'stations',
    matcher: (name) => /CSS \(TIANHE\)/i.test(name),
    classLabel: 'Station',
    operator: 'China',
    description: 'Crewed Chinese space station core module.'
  },
  {
    id: 'hubble',
    label: 'Hubble',
    source: 'science',
    matcher: (name) => /^(HST|HUBBLE)/i.test(name),
    classLabel: 'Science',
    operator: 'NASA / ESA',
    description: 'Space telescope in low Earth orbit.'
  },
  {
    id: 'terra',
    label: 'Terra',
    source: 'resource',
    matcher: (name) => /^TERRA$/i.test(name),
    classLabel: 'Earth Observation',
    operator: 'NASA',
    description: 'Earth-observation flagship for land, atmosphere, and climate.'
  },
  {
    id: 'aqua',
    label: 'Aqua',
    source: 'resource',
    matcher: (name) => /^AQUA$/i.test(name),
    classLabel: 'Earth Observation',
    operator: 'NASA',
    description: 'Water-cycle and atmospheric Earth-observation satellite.'
  },
  {
    id: 'landsat-9',
    label: 'Landsat 9',
    source: 'resource',
    matcher: (name) => /^LANDSAT 9$/i.test(name),
    classLabel: 'Earth Observation',
    operator: 'USGS / NASA',
    description: 'Land imaging and Earth surface monitoring.'
  },
  {
    id: 'sentinel-2a',
    label: 'Sentinel-2A',
    source: 'resource',
    matcher: (name) => /^SENTINEL-2A$/i.test(name),
    classLabel: 'Earth Observation',
    operator: 'ESA',
    description: 'Multispectral land and coastal imaging.'
  },
  {
    id: 'goes-16',
    label: 'GOES 16',
    source: 'weather',
    matcher: (name) => /^GOES 16$/i.test(name),
    classLabel: 'Weather',
    operator: 'NOAA',
    description: 'Geostationary weather satellite covering the Americas.'
  },
  {
    id: 'goes-18',
    label: 'GOES 18',
    source: 'weather',
    matcher: (name) => /^GOES 18$/i.test(name),
    classLabel: 'Weather',
    operator: 'NOAA',
    description: 'Geostationary weather satellite covering the Pacific basin.'
  },
  {
    id: 'himawari-9',
    label: 'Himawari-9',
    source: 'weather',
    matcher: (name) => /^HIMAWARI-9$/i.test(name),
    classLabel: 'Weather',
    operator: 'JMA',
    description: 'Geostationary weather satellite covering East Asia and the Pacific.'
  },
  {
    id: 'noaa-21',
    label: 'NOAA-21',
    source: 'weather',
    matcher: (name) => /^NOAA 21/i.test(name),
    classLabel: 'Weather',
    operator: 'NOAA / NASA',
    description: 'Polar weather and climate-monitoring satellite.'
  }
];

const FALLBACK_ORBITS = {
  iss: {
    type: 'circular',
    altitudeKm: 418,
    inclinationDeg: 51.64,
    periodMinutes: 92.68,
    raanDeg: 211,
    phaseDeg: 82
  },
  tiangong: {
    type: 'circular',
    altitudeKm: 390,
    inclinationDeg: 41.5,
    periodMinutes: 92.2,
    raanDeg: 124,
    phaseDeg: 146
  },
  hubble: {
    type: 'circular',
    altitudeKm: 535,
    inclinationDeg: 28.47,
    periodMinutes: 95.4,
    raanDeg: 89,
    phaseDeg: 36
  },
  terra: {
    type: 'circular',
    altitudeKm: 705,
    inclinationDeg: 98.2,
    periodMinutes: 98.88,
    raanDeg: 17,
    phaseDeg: 244
  },
  aqua: {
    type: 'circular',
    altitudeKm: 705,
    inclinationDeg: 98.2,
    periodMinutes: 98.8,
    raanDeg: 61,
    phaseDeg: 127
  },
  'landsat-9': {
    type: 'circular',
    altitudeKm: 705,
    inclinationDeg: 98.22,
    periodMinutes: 98.9,
    raanDeg: 145,
    phaseDeg: 308
  },
  'sentinel-2a': {
    type: 'circular',
    altitudeKm: 786,
    inclinationDeg: 98.62,
    periodMinutes: 100.6,
    raanDeg: 207,
    phaseDeg: 18
  },
  'goes-16': {
    type: 'geo',
    altitudeKm: 35786,
    subLonDeg: -75.2
  },
  'goes-18': {
    type: 'geo',
    altitudeKm: 35786,
    subLonDeg: -137.2
  },
  'himawari-9': {
    type: 'geo',
    altitudeKm: 35786,
    subLonDeg: 140.7
  },
  'noaa-21': {
    type: 'circular',
    altitudeKm: 824,
    inclinationDeg: 98.74,
    periodMinutes: 101.4,
    raanDeg: 278,
    phaseDeg: 58
  }
};

let _satLibPromise = null;
let _feedPromise = null;
let _lastFeedAt = 0;
let _curatedEntries = [];

function normalizeLongitude(lonDeg) {
  let value = Number(lonDeg) || 0;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function toDeg(value) {
  return value * 180 / Math.PI;
}

async function getSatelliteLib() {
  if (_satLibPromise) return _satLibPromise;
  _satLibPromise = import(SATELLITE_JS_URL).catch(() => null);
  return _satLibPromise;
}

function parseTleBlock(text, source) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const records = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const line1 = lines[i + 1].trim();
    const line2 = lines[i + 2].trim();
    if (!name || !line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
    records.push({ name, line1, line2, source });
  }
  return records;
}

async function fetchFeed(source) {
  const url = FEED_URLS[source];
  if (!url) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store'
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`satellite_feed_${source}_${response.status}`);
  const text = await response.text();
  return parseTleBlock(text, source);
}

function altitudeToSpeedKmS(altitudeKm = 0, periodMinutes = 90) {
  const periodSeconds = Math.max(60, Number(periodMinutes) || 90) * 60;
  const radiusKm = EARTH_RADIUS_KM + (Number(altitudeKm) || 0);
  return (2 * Math.PI * radiusKm) / periodSeconds;
}

function createFallbackEntry(wanted) {
  const orbit = FALLBACK_ORBITS[wanted.id];
  if (!orbit) return null;
  return {
    id: wanted.id,
    label: wanted.label,
    source: wanted.source,
    classLabel: wanted.classLabel,
    operator: wanted.operator,
    description: wanted.description,
    name: wanted.label,
    line1: '',
    line2: '',
    satrec: null,
    dataSource: 'fallback',
    orbitMode: orbit.type,
    orbit
  };
}

function buildCuratedEntries(allRecords, lib) {
  return CURATED_SATELLITES.map((wanted) => {
    const match = allRecords.find((record) => wanted.source === record.source && wanted.matcher(record.name));
    if (match && lib?.twoline2satrec) {
      return {
        id: wanted.id,
        label: wanted.label,
        source: wanted.source,
        classLabel: wanted.classLabel,
        operator: wanted.operator,
        description: wanted.description,
        name: match.name,
        line1: match.line1,
        line2: match.line2,
        satrec: lib.twoline2satrec(match.line1, match.line2),
        dataSource: 'live',
        orbitMode: 'tle',
        orbit: null
      };
    }
    return createFallbackEntry(wanted);
  }).filter(Boolean);
}

function sampleCircularOrbit(orbit, at, lib) {
  const epochMs = Number.isFinite(orbit?.epochMs) ? orbit.epochMs : FALLBACK_ORBIT_EPOCH_MS;
  const periodMinutes = Math.max(1, Number(orbit?.periodMinutes) || 90);
  const altitudeKm = Math.max(0, Number(orbit?.altitudeKm) || 0);
  const inclination = (Number(orbit?.inclinationDeg) || 0) * Math.PI / 180;
  const raan = (Number(orbit?.raanDeg) || 0) * Math.PI / 180;
  const phase0 = (Number(orbit?.phaseDeg) || 0) * Math.PI / 180;
  const argPerigee = (Number(orbit?.argPerigeeDeg) || 0) * Math.PI / 180;
  const elapsedTurns = ((at.getTime() - epochMs) / 60000) / periodMinutes;
  const anomaly = phase0 + (elapsedTurns * Math.PI * 2);
  const u = anomaly + argPerigee;
  const radiusKm = EARTH_RADIUS_KM + altitudeKm;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);
  const positionEci = {
    x: radiusKm * (cosRaan * cosU - sinRaan * sinU * cosInc),
    y: radiusKm * (sinRaan * cosU + cosRaan * sinU * cosInc),
    z: radiusKm * (sinU * sinInc)
  };
  const geodetic = lib?.eciToGeodetic && lib?.gstime
    ? lib.eciToGeodetic(positionEci, lib.gstime(at))
    : eciToGeodeticApprox(positionEci, at);
  return {
    lat: toDeg(geodetic.latitude),
    lon: normalizeLongitude(toDeg(geodetic.longitude)),
    altitudeKm,
    speedKmS: altitudeToSpeedKmS(altitudeKm, periodMinutes)
  };
}

function normalizeAngleRad(value) {
  let next = Number(value) || 0;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function gmstRadians(at = new Date()) {
  const ms = at instanceof Date ? at.getTime() : Date.now();
  const daysSinceJ2000 = (ms - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  return normalizeAngleRad((280.46061837 + 360.98564736629 * daysSinceJ2000) * Math.PI / 180);
}

function eciToGeodeticApprox(positionEci = {}, at = new Date()) {
  const x = Number(positionEci.x) || 0;
  const y = Number(positionEci.y) || 0;
  const z = Number(positionEci.z) || 0;
  const gmst = gmstRadians(at);
  const lon = normalizeAngleRad(Math.atan2(y, x) - gmst);
  const hyp = Math.hypot(x, y);
  const lat = Math.atan2(z, hyp);
  const height = Math.hypot(x, y, z) - EARTH_RADIUS_KM;
  return {
    latitude: lat,
    longitude: lon,
    height
  };
}

function geodeticToEcfApprox(geo = {}) {
  const lat = Number(geo.latitude) || 0;
  const lon = Number(geo.longitude) || 0;
  const height = Number(geo.height) || 0;
  const radius = EARTH_RADIUS_KM + height;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.cos(lon),
    y: radius * cosLat * Math.sin(lon),
    z: radius * Math.sin(lat)
  };
}

function ecfToLookAnglesApprox(observerGd = {}, ecf = {}) {
  const observer = geodeticToEcfApprox(observerGd);
  const rx = (Number(ecf.x) || 0) - observer.x;
  const ry = (Number(ecf.y) || 0) - observer.y;
  const rz = (Number(ecf.z) || 0) - observer.z;
  const lat = Number(observerGd.latitude) || 0;
  const lon = Number(observerGd.longitude) || 0;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const topS = sinLat * cosLon * rx + sinLat * sinLon * ry - cosLat * rz;
  const topE = -sinLon * rx + cosLon * ry;
  const topZ = cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;
  const rangeSat = Math.hypot(topS, topE, topZ);
  const elevation = rangeSat > 0 ? Math.asin(topZ / rangeSat) : -Math.PI * 0.5;
  const azimuth = ((Math.atan2(topE, -topS) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return { azimuth, elevation, rangeSat };
}

function sampleGeoOrbit(orbit) {
  const altitudeKm = Math.max(0, Number(orbit?.altitudeKm) || 35786);
  return {
    lat: 0,
    lon: normalizeLongitude(Number(orbit?.subLonDeg) || 0),
    altitudeKm,
    speedKmS: altitudeToSpeedKmS(altitudeKm, 1436.07)
  };
}

function sampleEntryState(entry, at, lib) {
  if (!entry) return null;
  if (entry.orbitMode === 'tle' && entry.satrec) {
    const result = lib.propagate(entry.satrec, at);
    const position = result?.position;
    if (!position) return null;
    const geodetic = lib.eciToGeodetic(position, lib.gstime(at));
    const altitudeKm = Number(geodetic.height);
    const velocityKmS = safeVelocityMagnitude(result?.velocity);
    return {
      lat: toDeg(geodetic.latitude),
      lon: normalizeLongitude(toDeg(geodetic.longitude)),
      altitudeKm: Number.isFinite(altitudeKm) ? altitudeKm : 0,
      speedKmS: Number.isFinite(velocityKmS) ? velocityKmS : null
    };
  }
  if (entry.orbitMode === 'geo') return sampleGeoOrbit(entry.orbit);
  if (entry.orbitMode === 'circular') return sampleCircularOrbit(entry.orbit, at, lib);
  return null;
}

async function refreshSatelliteCatalog(force = false) {
  const now = Date.now();
  if (!force && _curatedEntries.length && (now - _lastFeedAt) < SATELLITE_REFRESH_MS) {
    return _curatedEntries;
  }
  if (_feedPromise && !force) return _feedPromise;

  const groupedSources = Array.from(new Set(CURATED_SATELLITES.map((entry) => entry.source)));
  _feedPromise = Promise.allSettled(groupedSources.map((source) => fetchFeed(source))).then(async (groups) => {
    const allRecords = groups.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    const lib = allRecords.length ? await getSatelliteLib() : null;
    const curated = buildCuratedEntries(allRecords, lib);
    _curatedEntries = curated;
    _lastFeedAt = Date.now();
    return _curatedEntries;
  }).finally(() => {
    _feedPromise = null;
  });

  return _feedPromise;
}

function safeVelocityMagnitude(velocity = null) {
  if (!velocity) return null;
  const x = Number(velocity.x);
  const y = Number(velocity.y);
  const z = Number(velocity.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return Math.sqrt(x * x + y * y + z * z);
}

async function getSatelliteSnapshot(at = new Date(), forceRefresh = false) {
  const entries = await refreshSatelliteCatalog(forceRefresh);
  const lib = entries.some((entry) => entry?.orbitMode === 'tle') ? await getSatelliteLib() : null;
  return entries.map((entry) => {
    const sampled = sampleEntryState(entry, at, lib);
    if (!sampled) return null;
    return {
      id: entry.id,
      label: entry.label,
      classLabel: entry.classLabel,
      operator: entry.operator,
      description: entry.description,
      name: entry.name,
      source: entry.source,
      lat: sampled.lat,
      lon: sampled.lon,
      altitudeKm: sampled.altitudeKm,
      speedKmS: sampled.speedKmS,
      dataSource: entry.dataSource || 'live',
      timestampMs: at.getTime()
    };
  }).filter(Boolean);
}

async function getSatelliteLookAngles(satelliteId, observer, at = new Date()) {
  if (!observer || !Number.isFinite(observer.lat) || !Number.isFinite(observer.lon)) return null;
  const entries = await refreshSatelliteCatalog(false);
  const entry = entries.find((item) => item.id === satelliteId);
  if (!entry) return null;
  const lib = entry.orbitMode === 'tle' ? await getSatelliteLib() : null;
  const sampled = sampleEntryState(entry, at, lib);
  if (!sampled) return null;
  const ecfInput = {
    latitude: sampled.lat * Math.PI / 180,
    longitude: sampled.lon * Math.PI / 180,
    height: Number.isFinite(sampled.altitudeKm) ? sampled.altitudeKm : 0
  };
  const ecf = lib?.geodeticToEcf ? lib.geodeticToEcf(ecfInput) : geodeticToEcfApprox(ecfInput);
  const observerGd = {
    latitude: observer.lat * Math.PI / 180,
    longitude: observer.lon * Math.PI / 180,
    height: Number.isFinite(observer.heightKm) ? observer.heightKm : 0
  };
  const look = lib?.ecfToLookAngles ? lib.ecfToLookAngles(observerGd, ecf) : ecfToLookAnglesApprox(observerGd, ecf);
  if (!look) return null;
  return {
    azimuthDeg: ((toDeg(look.azimuth) % 360) + 360) % 360,
    elevationDeg: toDeg(look.elevation),
    rangeKm: Number(look.rangeSat)
  };
}

async function getSatelliteTrack(satelliteId, { samples = 40, stepMinutes = 6, at = new Date() } = {}) {
  const entries = await refreshSatelliteCatalog(false);
  const entry = entries.find((item) => item.id === satelliteId);
  if (!entry) return [];
  const lib = entry.orbitMode === 'tle' ? await getSatelliteLib() : null;
  const points = [];
  const half = Math.floor(samples * 0.5);
  for (let i = -half; i <= half; i++) {
    const sampleDate = new Date(at.getTime() + i * stepMinutes * 60 * 1000);
    const sampled = sampleEntryState(entry, sampleDate, lib);
    if (!sampled) continue;
    points.push({
      lat: sampled.lat,
      lon: sampled.lon,
      altitudeKm: sampled.altitudeKm,
      timestampMs: sampleDate.getTime()
    });
  }
  return points;
}

export {
  CURATED_SATELLITES,
  refreshSatelliteCatalog,
  getSatelliteSnapshot,
  getSatelliteLookAngles,
  getSatelliteTrack
};
