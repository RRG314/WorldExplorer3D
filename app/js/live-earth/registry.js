const LIVE_EARTH_CATEGORIES = [
  {
    id: 'space',
    label: 'Space',
    summary: 'Orbital systems, launch infrastructure, and near-Earth awareness.',
    layers: ['satellites', 'space-weather', 'near-earth-objects', 'rocket-launches']
  },
  {
    id: 'planet',
    label: 'Planet Activity',
    summary: 'Geologic activity, volcanic systems, and surface risk watch.',
    layers: ['earthquakes', 'volcanoes', 'wildfires']
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
  },
  {
    id: 'reality',
    label: 'Media & Places',
    summary: 'Curated real-world viewing and public place context.',
    layers: ['live-media']
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
  'space-weather': {
    id: 'space-weather',
    categoryId: 'space',
    label: 'Space Weather',
    shortLabel: 'Space Wx',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Solar weather context, aurora outlook guidance, and local sky readiness.',
    localSummary: 'Uses the current sky, orbital catalog, and globe selection to explain what space-weather conditions matter here.'
  },
  'near-earth-objects': {
    id: 'near-earth-objects',
    categoryId: 'space',
    label: 'Near-Earth Objects',
    shortLabel: 'NEOs',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Curated near-Earth object awareness and observation context.',
    localSummary: 'Shows notable observation targets and explains where this layer is headed next.'
  },
  'rocket-launches': {
    id: 'rocket-launches',
    categoryId: 'space',
    label: 'Rocket Launches',
    shortLabel: 'Launches',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Launch sites, orbital corridors, and the next expansion path for launch tracking.',
    localSummary: 'Uses curated launch-space regions so Live Earth stays useful before a full launch feed is attached.'
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
  volcanoes: {
    id: 'volcanoes',
    categoryId: 'planet',
    label: 'Volcanoes',
    shortLabel: 'Volcanoes',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Major volcanic systems, observatory context, and travel-ready hotspots.',
    localSummary: 'Curated volcanic systems are available now while the fuller observatory feed is staged.'
  },
  wildfires: {
    id: 'wildfires',
    categoryId: 'planet',
    label: 'Wildfires',
    shortLabel: 'Wildfires',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Fire-weather watchpoints and smoke-risk context for selected regions.',
    localSummary: 'This beta layer explains likely fire-weather pressure until a dedicated incident feed is attached.'
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
    summary: 'Moving shipping lanes, major marine corridors, and active vessel context.',
    localSummary: 'Shows active vessel markers and major shipping corridors across the globe.'
  },
  aircraft: {
    id: 'aircraft',
    categoryId: 'transport',
    label: 'Aircraft',
    shortLabel: 'Aircraft',
    status: 'implemented',
    globeMode: 'markers-tracks',
    summary: 'Moving flights, major air corridors, and global airway context.',
    localSummary: 'Shows active aircraft markers and major route corridors across the globe.'
  },
  'live-media': {
    id: 'live-media',
    categoryId: 'reality',
    label: 'Curated Live Media',
    shortLabel: 'Live Media',
    status: 'preview',
    globeMode: 'preview',
    summary: 'Curated public-viewing regions, landmark cameras, and media-ready places.',
    localSummary: 'This beta layer highlights where a future curated media window system can attach cleanly.'
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
