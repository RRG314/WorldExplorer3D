const LIVE_EARTH_CATEGORIES = [
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
  satellites: {
    id: 'satellites',
    categoryId: 'space',
    label: 'Satellites',
    shortLabel: 'Satellites',
    status: 'implemented',
    globeMode: 'markers-tracks',
    summary: 'Track a curated set of stations, Earth-observation, and weather satellites.',
    localSummary: 'Selected satellites can appear in the local sky when above the horizon.'
  },
  earthquakes: {
    id: 'earthquakes',
    categoryId: 'planet',
    label: 'Earthquakes',
    shortLabel: 'Quakes',
    status: 'implemented',
    globeMode: 'markers',
    summary: 'Recent USGS earthquakes with travel and local replay context.',
    localSummary: 'Travel to an event and replay a lightweight local shake.'
  },
  weather: {
    id: 'weather',
    categoryId: 'atmosphere',
    label: 'Weather',
    shortLabel: 'Weather',
    status: 'implemented',
    globeMode: 'markers',
    summary: 'Live atmospheric conditions tied to selected globe and local-world locations.',
    localSummary: 'Uses the same real local weather system already active in the 3D world.'
  },
  storms: {
    id: 'storms',
    categoryId: 'atmosphere',
    label: 'Storms',
    shortLabel: 'Storms',
    status: 'implemented',
    globeMode: 'markers',
    summary: 'Live severe-weather watchpoints derived from regional weather samples.',
    localSummary: 'Uses live weather snapshots to surface the strongest nearby storm-like conditions.'
  },
  'ocean-state': {
    id: 'ocean-state',
    categoryId: 'atmosphere',
    label: 'Ocean State',
    shortLabel: 'Ocean',
    status: 'implemented',
    globeMode: 'markers',
    summary: 'Current sea-state guidance built from marine weather and the runtime water system.',
    localSummary: 'Shows the current World Explorer sea state plus regional marine-condition samples.'
  },
  ships: {
    id: 'ships',
    categoryId: 'transport',
    label: 'Ships',
    shortLabel: 'Ships',
    status: 'implemented',
    globeMode: 'markers-tracks',
    summary: 'Modeled vessel movement along major marine corridors.',
    localSummary: 'Shows explicitly modeled vessel markers and major shipping corridors across the globe.'
  },
  aircraft: {
    id: 'aircraft',
    categoryId: 'transport',
    label: 'Aircraft',
    shortLabel: 'Aircraft',
    status: 'implemented',
    globeMode: 'markers-tracks',
    summary: 'Modeled flights along major air corridors.',
    localSummary: 'Shows explicitly modeled aircraft markers and major route corridors across the globe.'
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
