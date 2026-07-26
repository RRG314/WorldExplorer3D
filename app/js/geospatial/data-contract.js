const TRUTH_TYPES = Object.freeze([
  'observed',
  'authoritative',
  'modeled',
  'derived',
  'community-observed',
  'predicted',
  'reference',
  'inferred'
]);

const DATA_SOURCES = Object.freeze({
  celestrak: Object.freeze({
    id: 'celestrak',
    label: 'CelesTrak',
    operator: 'CelesTrak',
    truthType: 'authoritative',
    licenseId: 'provider-terms',
    homepage: 'https://celestrak.org/',
    description: 'Orbital elements propagated to a requested observation time.'
  }),
  'usgs-earthquakes': Object.freeze({
    id: 'usgs-earthquakes',
    label: 'USGS Earthquake Hazards Program',
    operator: 'United States Geological Survey',
    truthType: 'observed',
    licenseId: 'us-government-work',
    homepage: 'https://earthquake.usgs.gov/earthquakes/feed/',
    description: 'Observed earthquake events from the USGS GeoJSON feed.'
  }),
  'open-meteo': Object.freeze({
    id: 'open-meteo',
    label: 'Open-Meteo',
    operator: 'Open-Meteo',
    truthType: 'modeled',
    licenseId: 'provider-terms',
    homepage: 'https://open-meteo.com/',
    description: 'Current and forecast weather assembled from numerical weather models.'
  }),
  'open-meteo-marine': Object.freeze({
    id: 'open-meteo-marine',
    label: 'Open-Meteo Marine',
    operator: 'Open-Meteo',
    truthType: 'modeled',
    licenseId: 'provider-terms',
    homepage: 'https://open-meteo.com/en/docs/marine-weather-api',
    description: 'Global wave, current, sea-temperature, and modeled sea-level guidance.'
  }),
  'noaa-coops-observations': Object.freeze({
    id: 'noaa-coops-observations',
    label: 'NOAA CO-OPS observations',
    operator: 'NOAA Center for Operational Oceanographic Products and Services',
    truthType: 'observed',
    licenseId: 'us-government-work',
    homepage: 'https://tidesandcurrents.noaa.gov/',
    description: 'Station water-level observations with explicit datum, units, and quality status.'
  }),
  'noaa-coops-predictions': Object.freeze({
    id: 'noaa-coops-predictions',
    label: 'NOAA Tide Predictions',
    operator: 'NOAA Center for Operational Oceanographic Products and Services',
    truthType: 'predicted',
    licenseId: 'us-government-work',
    homepage: 'https://tidesandcurrents.noaa.gov/tide_predictions.html',
    description: 'Harmonic high and low tide predictions relative to a declared station datum.'
  }),
  panoramax: Object.freeze({
    id: 'panoramax',
    label: 'Panoramax',
    operator: 'Panoramax community federation',
    truthType: 'community-observed',
    licenseId: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    homepage: 'https://panoramax.openstreetmap.fr/',
    description: 'Timestamped, geolocated community street imagery.'
  }),
  kartaview: Object.freeze({
    id: 'kartaview',
    label: 'KartaView',
    operator: 'KartaView community',
    truthType: 'community-observed',
    licenseId: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    homepage: 'https://kartaview.org/',
    description: 'Timestamped, geolocated community street imagery.'
  }),
  opensky: Object.freeze({
    id: 'opensky',
    label: 'OpenSky Network',
    operator: 'The OpenSky Network',
    truthType: 'observed',
    licenseId: 'OpenSky terms',
    licenseUrl: 'https://opensky-network.org/about/terms-of-use',
    homepage: 'https://opensky-network.org/',
    description: 'Optional aircraft state vectors for operators with a written OpenSky operational-use agreement.'
  }),
  'adsb-lol': Object.freeze({
    id: 'adsb-lol',
    label: 'ADSB.lol',
    operator: 'ADSB.lol community',
    truthType: 'observed',
    licenseId: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    homepage: 'https://www.adsb.lol/',
    description: 'Default current community-fed ADS-B observations for the open-source distribution.'
  }),
  'transport-reference': Object.freeze({
    id: 'transport-reference',
    label: 'World Explorer reference routes',
    operator: 'World Explorer 3D',
    truthType: 'reference',
    licenseId: 'project-license',
    homepage: 'https://worldexplorer3d.io/',
    description: 'Modeled route context that is not a live ADS-B or AIS observation.'
  }),
  osm: Object.freeze({
    id: 'osm',
    label: 'OpenStreetMap',
    operator: 'OpenStreetMap contributors',
    truthType: 'authoritative',
    licenseId: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    homepage: 'https://www.openstreetmap.org/',
    description: 'Mapped streets, buildings, land use, water, and infrastructure.'
  }),
  worldcover: Object.freeze({
    id: 'worldcover',
    label: 'ESA WorldCover',
    operator: 'European Space Agency',
    truthType: 'derived',
    licenseId: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    homepage: 'https://esa-worldcover.org/',
    description: 'Satellite-derived global land-cover classification.'
  })
});

function getDataSource(sourceId) {
  return DATA_SOURCES[String(sourceId || '')] || null;
}

function finiteCoordinate(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

function normalizeGeoQuery(input = {}) {
  const lat = finiteCoordinate(input.lat, -90, 90, 'Latitude');
  const lon = finiteCoordinate(input.lon, -180, 180, 'Longitude');
  const radiusM = Math.max(20, Math.min(1000, Math.round(Number(input.radiusM) || 300)));
  const limit = Math.max(1, Math.min(12, Math.round(Number(input.limit) || 8)));
  return Object.freeze({ lat, lon, radiusM, limit });
}

function createProvenance(input = {}) {
  const source = getDataSource(input.sourceId);
  if (!source) throw new Error(`Unknown geospatial source: ${input.sourceId || 'missing'}`);
  const truthType = TRUTH_TYPES.includes(input.truthType) ? input.truthType : source.truthType;
  return Object.freeze({
    sourceId: source.id,
    sourceLabel: source.label,
    operator: source.operator,
    truthType,
    licenseId: String(input.licenseId || source.licenseId || ''),
    licenseUrl: String(input.licenseUrl || source.licenseUrl || ''),
    observedAt: String(input.observedAt || ''),
    validAt: String(input.validAt || input.observedAt || ''),
    fetchedAt: String(input.fetchedAt || new Date().toISOString()),
    accuracyM: Number.isFinite(Number(input.accuracyM)) ? Number(input.accuracyM) : null,
    resolutionM: Number.isFinite(Number(input.resolutionM)) ? Number(input.resolutionM) : null,
    isInferred: truthType === 'inferred'
  });
}

export {
  DATA_SOURCES,
  TRUTH_TYPES,
  createProvenance,
  getDataSource,
  normalizeGeoQuery
};
