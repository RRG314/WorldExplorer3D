const LIVE_EARTH_CATEGORIES = [
  {
    id: 'overview',
    label: 'Overview',
    summary: 'A combined operational picture with every available Earth system visible.',
    layers: ['overview']
  },
  {
    id: 'space',
    label: 'Space',
    summary: 'Operational satellite tracking and local-sky visibility.',
    layers: ['satellites']
  },
  {
    id: 'planet',
    label: 'Planet Activity',
    summary: 'Recent observed earthquake activity from the USGS feed.',
    layers: ['earthquakes']
  },
  {
    id: 'places',
    label: 'Street View',
    summary: 'Timestamped, attributed community street imagery around a selected location.',
    layers: ['street-imagery']
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere & Oceans',
    summary: 'Weather, storms, and ocean-state context.',
    layers: ['weather', 'storms', 'ocean-state']
  },
  {
    id: 'transport',
    label: 'Transport',
    summary: 'Air and marine movement context around the world.',
    layers: ['ships', 'aircraft']
  }
];

const LIVE_EARTH_LAYERS = {
  overview: {
    id: 'overview',
    categoryId: 'overview',
    label: 'Operational Overview',
    shortLabel: 'Overview',
    status: 'mixed',
    globeMode: 'combined',
    summary: 'Observed science feeds and clearly identified transport reference layers in one globe view.',
    localSummary: 'Open an individual layer for its observations, provenance, and actions.'
  },
  satellites: {
    id: 'satellites',
    categoryId: 'space',
    label: 'Satellites',
    shortLabel: 'Satellites',
    status: 'observed',
    globeMode: 'markers-tracks',
    summary: 'CelesTrak orbital elements propagated to current satellite positions.',
    localSummary: 'Selected satellites can appear in the local sky when above the horizon.',
    sourceIds: ['celestrak']
  },
  earthquakes: {
    id: 'earthquakes',
    categoryId: 'planet',
    label: 'Earthquakes',
    shortLabel: 'Quakes',
    status: 'observed',
    globeMode: 'markers',
    summary: 'Recent USGS earthquakes with travel and local replay context.',
    localSummary: 'Travel to an event and replay a lightweight local shake.',
    sourceIds: ['usgs-earthquakes']
  },
  'street-imagery': {
    id: 'street-imagery',
    categoryId: 'places',
    label: 'Street Imagery',
    shortLabel: 'Street View',
    status: 'observed',
    globeMode: 'selection',
    summary: 'Panoramax and KartaView imagery near the selected point with capture date, contributor, and license.',
    localSummary: 'Imagery is inspected separately and is not silently converted into building textures.',
    sourceIds: ['panoramax', 'kartaview']
  },
  weather: {
    id: 'weather',
    categoryId: 'atmosphere',
    label: 'Weather',
    shortLabel: 'Weather',
    status: 'current',
    globeMode: 'markers',
    summary: 'Current weather-model conditions tied to selected globe and local-world locations.',
    localSummary: 'Uses the same real local weather system already active in the 3D world.',
    sourceIds: ['open-meteo']
  },
  storms: {
    id: 'storms',
    categoryId: 'atmosphere',
    label: 'Storms',
    shortLabel: 'Storms',
    status: 'derived',
    globeMode: 'markers',
    summary: 'Live severe-weather watchpoints derived from regional weather samples.',
    localSummary: 'Uses live weather snapshots to surface the strongest nearby storm-like conditions.',
    sourceIds: ['open-meteo']
  },
  'ocean-state': {
    id: 'ocean-state',
    categoryId: 'atmosphere',
    label: 'Ocean State',
    shortLabel: 'Ocean',
    status: 'mixed',
    globeMode: 'markers',
    summary: 'Global modeled marine conditions plus NOAA water-level observations and tide predictions where covered.',
    localSummary: 'Separates modeled guidance, observed gauges, predicted tides, and the runtime water simulation.',
    sourceIds: ['open-meteo-marine', 'noaa-coops-observations', 'noaa-coops-predictions']
  },
  ships: {
    id: 'ships',
    categoryId: 'transport',
    label: 'Ships',
    shortLabel: 'Ships',
    status: 'reference',
    globeMode: 'markers-tracks',
    summary: 'Reference vessel movement along major marine corridors; not live AIS.',
    localSummary: 'Shows explicitly modeled vessel markers and major shipping corridors across the globe.',
    sourceIds: ['transport-reference']
  },
  aircraft: {
    id: 'aircraft',
    categoryId: 'transport',
    label: 'Aircraft',
    shortLabel: 'Aircraft',
    status: 'observed',
    globeMode: 'markers-tracks',
    summary: 'Current live ADS-B aircraft observations near the selected point, with labeled reference routes only as fallback.',
    localSummary: 'Shows observed ADS-B and Mode S state vectors without presenting schedules or inferred destinations as facts.',
    sourceIds: ['opensky', 'adsb-lol', 'transport-reference']
  }
};

function getLiveEarthCategory(categoryId) {
  return LIVE_EARTH_CATEGORIES.find((entry) => entry.id === categoryId) || LIVE_EARTH_CATEGORIES[0];
}

function getLiveEarthLayer(layerId) {
  return LIVE_EARTH_LAYERS[layerId] || null;
}

function getLayersForCategory(categoryId) {
  const category = getLiveEarthCategory(categoryId);
  return category.layers.map((layerId) => getLiveEarthLayer(layerId)).filter(Boolean);
}

export {
  LIVE_EARTH_CATEGORIES,
  LIVE_EARTH_LAYERS,
  getLayersForCategory,
  getLiveEarthCategory,
  getLiveEarthLayer
};
