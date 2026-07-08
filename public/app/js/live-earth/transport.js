function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeLongitude(lonDeg) {
  let value = Number(lonDeg) || 0;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function wrapDeltaLon(deltaDeg) {
  let value = Number(deltaDeg) || 0;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpLon(a, b, t) {
  return normalizeLongitude(a + wrapDeltaLon(b - a) * t);
}

function toRad(value) {
  return (Number(value) || 0) * Math.PI / 180;
}

function haversineKm(latA, lonA, latB, lonB) {
  const dLat = toRad(latB - latA);
  const dLon = toRad(wrapDeltaLon(lonB - lonA));
  const aLat = toRad(latA);
  const bLat = toRad(latB);
  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const a = sinLat * sinLat + Math.cos(aLat) * Math.cos(bLat) * sinLon * sinLon;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
}

function buildRouteCache(points = []) {
  const normalized = points.map((point) => ({
    lat: Number(point.lat) || 0,
    lon: normalizeLongitude(point.lon)
  }));
  let totalKm = 0;
  const segmentLengthsKm = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const start = normalized[index];
    const end = normalized[index + 1];
    const lengthKm = haversineKm(start.lat, start.lon, end.lat, end.lon);
    segmentLengthsKm.push(lengthKm);
    totalKm += lengthKm;
  }
  return {
    points: normalized,
    segmentLengthsKm,
    totalKm: Math.max(totalKm, 1)
  };
}

function sampleRoute(cache, t = 0) {
  const safeT = clamp01(t);
  const points = cache?.points || [];
  if (points.length < 2) {
    const fallback = points[0] || { lat: 0, lon: 0 };
    return {
      lat: fallback.lat,
      lon: fallback.lon,
      headingDeg: 0,
      progressPct: Math.round(safeT * 100)
    };
  }
  const targetKm = cache.totalKm * safeT;
  let traversedKm = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentKm = Math.max(cache.segmentLengthsKm[index] || 0, 0.001);
    if (index === points.length - 2 || traversedKm + segmentKm >= targetKm) {
      const localT = clamp01((targetKm - traversedKm) / segmentKm);
      const lat = lerp(start.lat, end.lat, localT);
      const lon = lerpLon(start.lon, end.lon, localT);
      const headingDeg = (Math.atan2(
        wrapDeltaLon(end.lon - start.lon),
        end.lat - start.lat
      ) * 180 / Math.PI + 360) % 360;
      return {
        lat,
        lon,
        headingDeg,
        progressPct: Math.round(safeT * 100)
      };
    }
    traversedKm += segmentKm;
  }
  const last = points[points.length - 1];
  return {
    lat: last.lat,
    lon: last.lon,
    headingDeg: 0,
    progressPct: 100
  };
}

function buildRenderPoints(cache, type = 'ship', steps = 48) {
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const sample = sampleRoute(cache, t);
    const altitude = type === 'aircraft'
      ? 1.03 + Math.sin(Math.PI * t) * 0.024
      : 1.013;
    points.push({
      lat: sample.lat,
      lon: sample.lon,
      altitude
    });
  }
  return points;
}

const SHIP_CHANNELS = [
  {
    id: 'north-atlantic',
    label: 'North Atlantic Shipping Lane',
    region: 'North Atlantic',
    summary: 'Container traffic between the US East Coast and Rotterdam via the North Atlantic approaches.',
    color: 0x4fd1ff,
    cycleMinutes: 280,
    points: [
      { lat: 40.7, lon: -74.0 },
      { lat: 43.5, lon: -56.0 },
      { lat: 48.5, lon: -28.0 },
      { lat: 51.9, lon: 4.4 }
    ],
    vessels: [
      { id: 'atlantic-trader', label: 'Atlantic Trader 204', speedKt: 19, phase: 0.05, operator: 'Blue Atlantic' },
      { id: 'harbor-star', label: 'Harbor Star 88', speedKt: 17, phase: 0.39, operator: 'North Line' },
      { id: 'rotterdam-link', label: 'Rotterdam Link', speedKt: 20, phase: 0.72, operator: 'Trans Euro Cargo' },
      { id: 'ocean-horizon', label: 'Ocean Horizon 3', speedKt: 18, phase: 0.86, operator: 'Harbor Atlantic' }
    ]
  },
  {
    id: 'suez-corridor',
    label: 'Suez Connector',
    region: 'Mediterranean to Asia',
    summary: 'A high-volume Europe to Asia corridor crossing the Mediterranean, Suez, and the Arabian Sea.',
    color: 0x67e8f9,
    cycleMinutes: 360,
    points: [
      { lat: 36.0, lon: -5.3 },
      { lat: 35.6, lon: 14.5 },
      { lat: 30.0, lon: 32.5 },
      { lat: 16.9, lon: 42.8 },
      { lat: 8.9, lon: 61.0 },
      { lat: 1.3, lon: 103.8 }
    ],
    vessels: [
      { id: 'suez-meridian', label: 'Suez Meridian', speedKt: 18, phase: 0.12, operator: 'Global East' },
      { id: 'canal-express', label: 'Canal Express 7', speedKt: 16, phase: 0.47, operator: 'Canal Bridge' },
      { id: 'red-sea-runner', label: 'Red Sea Runner', speedKt: 17, phase: 0.83, operator: 'Oceanic Freight' },
      { id: 'levant-freight', label: 'Levant Freight', speedKt: 17, phase: 0.62, operator: 'MedEast Cargo' }
    ]
  },
  {
    id: 'strait-malacca',
    label: 'Strait of Malacca Flow',
    region: 'Southeast Asia',
    summary: 'One of the busiest global shipping approaches linking Singapore, the Malacca Strait, and East Asia.',
    color: 0x38bdf8,
    cycleMinutes: 210,
    points: [
      { lat: 1.3, lon: 103.8 },
      { lat: 4.5, lon: 100.4 },
      { lat: 9.0, lon: 102.5 },
      { lat: 16.2, lon: 110.6 },
      { lat: 31.2, lon: 121.5 }
    ],
    vessels: [
      { id: 'strait-pioneer', label: 'Strait Pioneer', speedKt: 18, phase: 0.08, operator: 'Malay Passage' },
      { id: 'eastern-bridge', label: 'Eastern Bridge 15', speedKt: 17, phase: 0.34, operator: 'Pacific Logistics' },
      { id: 'singapore-riser', label: 'Singapore Riser', speedKt: 19, phase: 0.66, operator: 'Lion Port Group' },
      { id: 'java-current', label: 'Java Current', speedKt: 18, phase: 0.88, operator: 'Eastern Freight' }
    ]
  },
  {
    id: 'panama-link',
    label: 'Panama Pacific Connector',
    region: 'Panama / Pacific',
    summary: 'A coast-to-coast routing context for ships moving between the Gulf, the canal, and the US West Coast.',
    color: 0x22d3ee,
    cycleMinutes: 250,
    points: [
      { lat: 29.8, lon: -95.0 },
      { lat: 21.6, lon: -88.1 },
      { lat: 9.0, lon: -79.6 },
      { lat: 20.0, lon: -111.0 },
      { lat: 33.7, lon: -118.2 }
    ],
    vessels: [
      { id: 'canal-hopper', label: 'Canal Hopper', speedKt: 16, phase: 0.19, operator: 'CanalWest' },
      { id: 'pacific-ramp', label: 'Pacific Ramp', speedKt: 18, phase: 0.52, operator: 'West Harbor' },
      { id: 'gulf-exchange', label: 'Gulf Exchange', speedKt: 17, phase: 0.85, operator: 'Bay Cargo' },
      { id: 'canal-westbound', label: 'Canal Westbound', speedKt: 16, phase: 0.69, operator: 'Pacific Canal' }
    ]
  },
  {
    id: 'english-channel',
    label: 'English Channel Density',
    region: 'North Sea Gateway',
    summary: 'Dense vessel movement through the Channel and into the North Sea port complex.',
    color: 0x7dd3fc,
    cycleMinutes: 110,
    points: [
      { lat: 49.9, lon: -5.8 },
      { lat: 50.3, lon: -1.4 },
      { lat: 51.1, lon: 1.8 },
      { lat: 51.9, lon: 4.4 }
    ],
    vessels: [
      { id: 'channel-pilot', label: 'Channel Pilot', speedKt: 15, phase: 0.11, operator: 'North Sea Ops' },
      { id: 'dover-stream', label: 'Dover Stream', speedKt: 14, phase: 0.41, operator: 'HarborNet' },
      { id: 'zee-lane', label: 'Zee Lane', speedKt: 15, phase: 0.74, operator: 'Delta Marine' },
      { id: 'north-sea-bridge', label: 'North Sea Bridge', speedKt: 14, phase: 0.91, operator: 'Channel Freight' }
    ]
  },
  {
    id: 'gulf-india-energy',
    label: 'Gulf to India Energy Lane',
    region: 'Arabian Sea',
    summary: 'High-volume tanker and container traffic between the Gulf hubs, India, and Singapore.',
    color: 0x5eead4,
    cycleMinutes: 240,
    points: [
      { lat: 25.2, lon: 55.3 },
      { lat: 26.7, lon: 56.3 },
      { lat: 19.1, lon: 72.8 },
      { lat: 6.9, lon: 79.9 },
      { lat: 1.3, lon: 103.8 }
    ],
    vessels: [
      { id: 'hormuz-stream', label: 'Hormuz Stream', speedKt: 16, phase: 0.09, operator: 'Gulf Energy Marine' },
      { id: 'arabian-lift', label: 'Arabian Lift 12', speedKt: 17, phase: 0.33, operator: 'SeaBridge Energy' },
      { id: 'monsoon-passage', label: 'Monsoon Passage', speedKt: 18, phase: 0.59, operator: 'Monsoon Freight' },
      { id: 'colombo-link', label: 'Colombo Link', speedKt: 17, phase: 0.82, operator: 'Indian Ocean Lines' }
    ]
  },
  {
    id: 'east-asia-coastal',
    label: 'East Asia Coastal Spine',
    region: 'South China Sea to Japan',
    summary: 'Dense commercial traffic connecting Singapore, Hong Kong, Shanghai, Busan, and Japan.',
    color: 0x60a5fa,
    cycleMinutes: 230,
    points: [
      { lat: 1.3, lon: 103.8 },
      { lat: 14.6, lon: 120.9 },
      { lat: 22.3, lon: 114.2 },
      { lat: 31.2, lon: 121.5 },
      { lat: 35.1, lon: 129.0 },
      { lat: 35.7, lon: 139.8 }
    ],
    vessels: [
      { id: 'pearl-current', label: 'Pearl Current', speedKt: 18, phase: 0.05, operator: 'Pacific Delta Shipping' },
      { id: 'busan-lift', label: 'Busan Lift', speedKt: 17, phase: 0.29, operator: 'Harbor East' },
      { id: 'tokyo-exchange', label: 'Tokyo Exchange', speedKt: 18, phase: 0.54, operator: 'Nippon Freight' },
      { id: 'south-china-flow', label: 'South China Flow', speedKt: 17, phase: 0.79, operator: 'Coastal Asia Cargo' }
    ]
  },
  {
    id: 'south-atlantic-brazil',
    label: 'South Atlantic Brazil Run',
    region: 'Atlantic Europe to Brazil',
    summary: 'A long-haul Atlantic corridor linking Europe, West Africa, Brazil, and the River Plate region.',
    color: 0x38bdf8,
    cycleMinutes: 330,
    points: [
      { lat: 51.9, lon: 4.4 },
      { lat: 28.1, lon: -15.4 },
      { lat: 14.7, lon: -17.5 },
      { lat: -22.9, lon: -43.2 },
      { lat: -23.9, lon: -46.3 },
      { lat: -34.6, lon: -58.4 }
    ],
    vessels: [
      { id: 'atlantic-southbound', label: 'Atlantic Southbound', speedKt: 18, phase: 0.13, operator: 'South Atlantic Cargo' },
      { id: 'rio-freighter', label: 'Rio Freighter', speedKt: 17, phase: 0.38, operator: 'Brazil Trade Link' },
      { id: 'plate-runner', label: 'Plate Runner', speedKt: 18, phase: 0.61, operator: 'Mercosur Marine' },
      { id: 'santos-bridge', label: 'Santos Bridge', speedKt: 17, phase: 0.87, operator: 'Atlantic Delta Freight' }
    ]
  }
];

const AIR_CORRIDORS = [
  {
    id: 'transatlantic',
    label: 'North Atlantic Airways',
    region: 'US East Coast to Europe',
    summary: 'The busy transatlantic flow between major US gateways and Western Europe.',
    color: 0xfbbf24,
    cycleMinutes: 140,
    points: [
      { lat: 40.6, lon: -73.8 },
      { lat: 46.0, lon: -40.0 },
      { lat: 51.5, lon: -0.4 }
    ],
    flights: [
      { id: 'atl-231', label: 'AT 231', speedKt: 470, phase: 0.04, operator: 'Atlantic Air' },
      { id: 'euro-518', label: 'EU 518', speedKt: 485, phase: 0.36, operator: 'EuroSky' },
      { id: 'oceanic-90', label: 'OC 90', speedKt: 478, phase: 0.69, operator: 'Oceanic' },
      { id: 'bridge-404', label: 'BR 404', speedKt: 482, phase: 0.86, operator: 'Bridge Atlantic' }
    ]
  },
  {
    id: 'europe-middle-east',
    label: 'Europe to Gulf Corridor',
    region: 'Europe to Gulf',
    summary: 'A long-haul corridor linking Western Europe and the Gulf hub system.',
    color: 0xf59e0b,
    cycleMinutes: 150,
    points: [
      { lat: 51.5, lon: -0.4 },
      { lat: 46.5, lon: 10.0 },
      { lat: 39.0, lon: 28.5 },
      { lat: 25.2, lon: 55.3 }
    ],
    flights: [
      { id: 'gulf-401', label: 'GF 401', speedKt: 495, phase: 0.18, operator: 'Gulf Bridge' },
      { id: 'desert-77', label: 'DS 77', speedKt: 501, phase: 0.57, operator: 'Desert Airways' },
      { id: 'eurojet-62', label: 'EJ 62', speedKt: 486, phase: 0.84, operator: 'EuroJet' },
      { id: 'orient-link', label: 'OR 214', speedKt: 492, phase: 0.71, operator: 'Orient Link' }
    ]
  },
  {
    id: 'asia-pacific',
    label: 'Asia Pacific Spine',
    region: 'East and Southeast Asia',
    summary: 'A regional corridor connecting Tokyo, Taipei, Hong Kong, and Singapore.',
    color: 0xfcd34d,
    cycleMinutes: 120,
    points: [
      { lat: 35.5, lon: 139.8 },
      { lat: 25.1, lon: 121.2 },
      { lat: 22.3, lon: 113.9 },
      { lat: 1.3, lon: 103.8 }
    ],
    flights: [
      { id: 'pac-302', label: 'PC 302', speedKt: 455, phase: 0.09, operator: 'Pacific Connect' },
      { id: 'harbor-219', label: 'HB 219', speedKt: 448, phase: 0.43, operator: 'Harbor Air Asia' },
      { id: 'lion-508', label: 'LN 508', speedKt: 452, phase: 0.76, operator: 'LionSky' },
      { id: 'taipei-bridge', label: 'TP 622', speedKt: 446, phase: 0.91, operator: 'Taipei Bridge Air' }
    ]
  },
  {
    id: 'us-east-coast',
    label: 'US East Coast Shuttle',
    region: 'Northeast Corridor',
    summary: 'High-frequency domestic flying between Boston, New York, Washington, and Miami.',
    color: 0xfbbf24,
    cycleMinutes: 88,
    points: [
      { lat: 42.4, lon: -71.0 },
      { lat: 40.6, lon: -73.8 },
      { lat: 38.9, lon: -77.0 },
      { lat: 25.8, lon: -80.3 }
    ],
    flights: [
      { id: 'coast-15', label: 'CT 15', speedKt: 436, phase: 0.13, operator: 'Coast Shuttle' },
      { id: 'metro-84', label: 'MT 84', speedKt: 428, phase: 0.48, operator: 'Metro Air' },
      { id: 'sun-242', label: 'SN 242', speedKt: 441, phase: 0.79, operator: 'SunJet' },
      { id: 'corridor-18', label: 'CR 18', speedKt: 434, phase: 0.92, operator: 'Northeast Corridor Air' }
    ]
  },
  {
    id: 'us-west-coast',
    label: 'US West Coast Shuttle',
    region: 'California / Pacific Northwest',
    summary: 'Short-haul west-coast operations along the California and Pacific Northwest spine.',
    color: 0xf59e0b,
    cycleMinutes: 82,
    points: [
      { lat: 47.4, lon: -122.3 },
      { lat: 45.6, lon: -122.6 },
      { lat: 37.6, lon: -122.4 },
      { lat: 33.9, lon: -118.4 }
    ],
    flights: [
      { id: 'west-10', label: 'WS 10', speedKt: 425, phase: 0.07, operator: 'WestAir' },
      { id: 'cal-305', label: 'CA 305', speedKt: 432, phase: 0.39, operator: 'California Express' },
      { id: 'pacline-72', label: 'PL 72', speedKt: 429, phase: 0.68, operator: 'PacLine' },
      { id: 'seattle-hopper', label: 'SH 208', speedKt: 422, phase: 0.86, operator: 'Seattle Hopper' }
    ]
  },
  {
    id: 'oceania-link',
    label: 'Australia and Pacific Long-Haul',
    region: 'Australia / Pacific',
    summary: 'Long-haul flying between Southeast Asia, Australia, and New Zealand.',
    color: 0xfcd34d,
    cycleMinutes: 170,
    points: [
      { lat: 1.3, lon: 103.8 },
      { lat: -6.1, lon: 106.7 },
      { lat: -33.9, lon: 151.2 },
      { lat: -37.0, lon: 174.8 }
    ],
    flights: [
      { id: 'southern-18', label: 'ST 18', speedKt: 489, phase: 0.16, operator: 'Southern Star' },
      { id: 'tasman-51', label: 'TZ 51', speedKt: 478, phase: 0.51, operator: 'Tasman Air' },
      { id: 'sunrise-808', label: 'SR 808', speedKt: 495, phase: 0.86, operator: 'Sunrise Pacific' },
      { id: 'oceania-bridge', label: 'OB 414', speedKt: 487, phase: 0.68, operator: 'Oceania Bridge' }
    ]
  },
  {
    id: 'transpacific',
    label: 'Transpacific Long-Haul',
    region: 'East Asia to North America',
    summary: 'Long-haul flying between Japan, Hawaii, California, and the Pacific gateway cities.',
    color: 0xfbbf24,
    cycleMinutes: 190,
    points: [
      { lat: 35.7, lon: 139.8 },
      { lat: 21.3, lon: -157.9 },
      { lat: 37.6, lon: -122.4 },
      { lat: 34.0, lon: -118.4 }
    ],
    flights: [
      { id: 'pacific-901', label: 'PA 901', speedKt: 506, phase: 0.05, operator: 'Pacific Gateway' },
      { id: 'island-220', label: 'IS 220', speedKt: 494, phase: 0.31, operator: 'Island Pacific' },
      { id: 'horizon-119', label: 'HZ 119', speedKt: 501, phase: 0.57, operator: 'Horizon World' },
      { id: 'westbound-44', label: 'WB 44', speedKt: 498, phase: 0.82, operator: 'Westbound Air' }
    ]
  },
  {
    id: 'india-southeast-asia',
    label: 'India to Southeast Asia',
    region: 'Indian Ocean Air Corridor',
    summary: 'Busy regional and medium-haul flying between the Gulf, India, and Southeast Asia.',
    color: 0xf59e0b,
    cycleMinutes: 118,
    points: [
      { lat: 25.2, lon: 55.3 },
      { lat: 19.1, lon: 72.9 },
      { lat: 13.0, lon: 80.2 },
      { lat: 6.9, lon: 79.9 },
      { lat: 1.3, lon: 103.8 }
    ],
    flights: [
      { id: 'monsoon-61', label: 'MN 61', speedKt: 470, phase: 0.11, operator: 'Monsoon Air' },
      { id: 'bay-route', label: 'BR 72', speedKt: 466, phase: 0.36, operator: 'Bay Route' },
      { id: 'gulf-india', label: 'GI 310', speedKt: 481, phase: 0.58, operator: 'Gulf India Air' },
      { id: 'singa-link', label: 'SL 88', speedKt: 474, phase: 0.83, operator: 'Singa Link' }
    ]
  },
  {
    id: 'south-america-spine',
    label: 'South America Spine',
    region: 'Brazil to Southern Cone',
    summary: 'A regional corridor linking Sao Paulo, Rio, Buenos Aires, Santiago, and Lima.',
    color: 0xfcd34d,
    cycleMinutes: 132,
    points: [
      { lat: -23.6, lon: -46.7 },
      { lat: -22.9, lon: -43.2 },
      { lat: -34.8, lon: -58.5 },
      { lat: -33.4, lon: -70.8 },
      { lat: -12.0, lon: -77.1 }
    ],
    flights: [
      { id: 'andes-204', label: 'AN 204', speedKt: 454, phase: 0.08, operator: 'Andes Connect' },
      { id: 'rio-plate', label: 'RP 311', speedKt: 447, phase: 0.33, operator: 'Rio Plate Air' },
      { id: 'southern-cone', label: 'SC 95', speedKt: 451, phase: 0.63, operator: 'Southern Cone' },
      { id: 'pacifico-17', label: 'PC 17', speedKt: 458, phase: 0.87, operator: 'Pacifico' }
    ]
  },
  {
    id: 'europe-core',
    label: 'Europe Core Airways',
    region: 'Western and Central Europe',
    summary: 'Dense hub-to-hub flying between London, Frankfurt, Paris, Milan, and Madrid.',
    color: 0xf59e0b,
    cycleMinutes: 94,
    points: [
      { lat: 51.5, lon: -0.4 },
      { lat: 49.0, lon: 2.5 },
      { lat: 50.0, lon: 8.6 },
      { lat: 45.5, lon: 9.3 },
      { lat: 40.5, lon: -3.6 }
    ],
    flights: [
      { id: 'euro-core-7', label: 'EC 7', speedKt: 433, phase: 0.06, operator: 'Euro Core' },
      { id: 'frankfurt-link', label: 'FL 128', speedKt: 427, phase: 0.29, operator: 'Frankfurt Link' },
      { id: 'iberia-bridge', label: 'IB 412', speedKt: 439, phase: 0.58, operator: 'Iberia Bridge' },
      { id: 'med-jet', label: 'MJ 66', speedKt: 431, phase: 0.84, operator: 'MedJet' }
    ]
  }
];

function buildRouteDefinitions(definitions = [], type = 'ship') {
  return definitions.map((entry) => {
    const cache = buildRouteCache(entry.points || []);
    return {
      ...entry,
      type,
      cache,
      renderPoints: buildRenderPoints(cache, type, type === 'aircraft' ? 64 : 44)
    };
  });
}

const SHIP_ROUTE_DEFS = buildRouteDefinitions(SHIP_CHANNELS, 'ship');
const AIR_ROUTE_DEFS = buildRouteDefinitions(AIR_CORRIDORS, 'aircraft');

function buildShipTrafficSnapshot(now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const routes = SHIP_ROUTE_DEFS;
  const items = routes.flatMap((route) => route.vessels.map((vessel) => {
    const progress = ((nowMs / 60000) / Math.max(route.cycleMinutes || 240, 40) + Number(vessel.phase || 0)) % 1;
    const sample = sampleRoute(route.cache, progress);
    return {
      id: vessel.id,
      type: 'ship',
      label: vessel.label,
      operator: vessel.operator,
      routeId: route.id,
      routeLabel: route.label,
      routeSummary: route.summary,
      region: route.region,
      speedKt: vessel.speedKt,
      lat: sample.lat,
      lon: sample.lon,
      headingDeg: sample.headingDeg,
      progressPct: sample.progressPct,
      altitude: 1.018,
      meta: `${vessel.speedKt} kt • ${route.region}`,
      description: `${vessel.label} is following the ${route.label.toLowerCase()} corridor.`
    };
  }));
  return { routes, items };
}

function buildAircraftTrafficSnapshot(now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const routes = AIR_ROUTE_DEFS;
  const items = routes.flatMap((route) => route.flights.map((flight) => {
    const progress = ((nowMs / 60000) / Math.max(route.cycleMinutes || 120, 30) + Number(flight.phase || 0)) % 1;
    const sample = sampleRoute(route.cache, progress);
    const cruiseScale = 1.045 + Math.sin(Math.PI * progress) * 0.022;
    return {
      id: flight.id,
      type: 'aircraft',
      label: flight.label,
      operator: flight.operator,
      routeId: route.id,
      routeLabel: route.label,
      routeSummary: route.summary,
      region: route.region,
      speedKt: flight.speedKt,
      lat: sample.lat,
      lon: sample.lon,
      headingDeg: sample.headingDeg,
      progressPct: sample.progressPct,
      altitude: cruiseScale,
      meta: `${flight.speedKt} kt • ${route.region}`,
      description: `${flight.label} is moving along the ${route.label.toLowerCase()} corridor.`
    };
  }));
  return { routes, items };
}

function nearestRouteContext(routes = [], lat = null, lon = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(routes) || !routes.length) return null;
  let best = null;
  routes.forEach((route) => {
    (route.cache?.points || []).forEach((point) => {
      const distanceKm = haversineKm(lat, lon, point.lat, point.lon);
      if (!best || distanceKm < best.distanceKm) {
        best = {
          routeId: route.id,
          routeLabel: route.label,
          region: route.region,
          distanceKm
        };
      }
    });
  });
  return best;
}

export {
  AIR_ROUTE_DEFS,
  SHIP_ROUTE_DEFS,
  buildAircraftTrafficSnapshot,
  buildShipTrafficSnapshot,
  haversineKm,
  nearestRouteContext,
  normalizeLongitude
};
