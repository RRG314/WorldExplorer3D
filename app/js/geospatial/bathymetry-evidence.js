const GEBCO_WMS_ENDPOINT = 'https://wms.gebco.net/mapserv';
const GEBCO_WMS_LAYER = 'GEBCO_LATEST_2';
const GEBCO_NOMINAL_GRID_ARC_SECONDS = 15;
const GEBCO_VERTICAL_DATUM = 'assumed-mean-sea-level';

const DEPTH_TRUTH_TYPE = Object.freeze({
  UNKNOWN: 'unknown',
  MEASURED: 'measured',
  MODELED: 'modeled',
  DERIVED: 'derived'
});

const SUPPORTED_DEPTH_TRUTH_TYPES = new Set(Object.values(DEPTH_TRUTH_TYPE));

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDepthEvidence(input = null) {
  if (!input || typeof input !== 'object') {
    return Object.freeze({
      truthType: DEPTH_TRUTH_TYPE.UNKNOWN,
      depthMeters: null,
      elevationMeters: null,
      sourceId: 'none',
      reason: 'no-depth-evidence'
    });
  }

  const requestedTruthType = String(input.truthType || input.status || '').trim().toLowerCase();
  const truthType = SUPPORTED_DEPTH_TRUTH_TYPES.has(requestedTruthType)
    ? requestedTruthType
    : DEPTH_TRUTH_TYPE.UNKNOWN;
  const sourceId = String(input.sourceId || input.source || '').trim().slice(0, 120);
  const elevationMeters = finiteNumber(input.elevationMeters);
  const explicitDepthMeters = finiteNumber(input.depthMeters);
  const depthMeters = explicitDepthMeters !== null && explicitDepthMeters >= 0
    ? explicitDepthMeters
    : elevationMeters !== null && elevationMeters < 0
      ? Math.abs(elevationMeters)
      : null;
  const usable = truthType !== DEPTH_TRUTH_TYPE.UNKNOWN && sourceId && depthMeters !== null;

  if (!usable) {
    return Object.freeze({
      truthType: DEPTH_TRUTH_TYPE.UNKNOWN,
      depthMeters: null,
      elevationMeters,
      sourceId: sourceId || 'none',
      reason: String(input.reason || (depthMeters === null ? 'no-submerged-elevation' : 'unqualified-depth-source'))
    });
  }

  return Object.freeze({
    truthType,
    depthMeters,
    elevationMeters: elevationMeters ?? -depthMeters,
    sourceId,
    dataset: String(input.dataset || '').trim() || null,
    datasetRelease: String(input.datasetRelease || '').trim() || null,
    layer: String(input.layer || '').trim() || null,
    verticalDatum: String(input.verticalDatum || '').trim() || null,
    nominalGridArcSeconds: finiteNumber(input.nominalGridArcSeconds),
    sampleWindowDegrees: finiteNumber(input.sampleWindowDegrees),
    qualityClass: String(input.qualityClass || '').trim() || null,
    fetchedAt: String(input.fetchedAt || '').trim() || null,
    sourceUrl: String(input.sourceUrl || '').trim() || null,
    navigationSafe: input.navigationSafe === true
  });
}

function createGebcoDepthEvidence(elevationMeters, options = {}) {
  return normalizeDepthEvidence({
    truthType: DEPTH_TRUTH_TYPE.MODELED,
    elevationMeters,
    sourceId: 'gebco-wms',
    dataset: 'GEBCO global terrain model',
    datasetRelease: options.datasetRelease || 'service-layer-current',
    layer: GEBCO_WMS_LAYER,
    verticalDatum: GEBCO_VERTICAL_DATUM,
    nominalGridArcSeconds: GEBCO_NOMINAL_GRID_ARC_SECONDS,
    sampleWindowDegrees: options.sampleWindowDegrees,
    qualityClass: 'mixed-source-grid-without-tid-cell-classification',
    fetchedAt: options.fetchedAt,
    sourceUrl: GEBCO_WMS_ENDPOINT,
    navigationSafe: false
  });
}

function gebcoFeatureInfoUrl(lat, lon, options = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError('GEBCO latitude is invalid.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError('GEBCO longitude is invalid.');
  const halfSpan = Number.isFinite(options.halfSpanDegrees) ? Math.max(0.0001, Number(options.halfSpanDegrees)) : 0.01;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: GEBCO_WMS_LAYER,
    QUERY_LAYERS: GEBCO_WMS_LAYER,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: `${longitude - halfSpan},${latitude - halfSpan},${longitude + halfSpan},${latitude + halfSpan}`,
    WIDTH: '64',
    HEIGHT: '64',
    FORMAT: 'image/png',
    INFO_FORMAT: 'text/plain',
    X: '32',
    Y: '32'
  });
  return {
    url: `${GEBCO_WMS_ENDPOINT}?${params.toString()}`,
    sampleWindowDegrees: halfSpan * 2
  };
}

async function fetchGebcoDepthEvidence(lat, lon, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== 'function') throw new Error('GEBCO bathymetry requires fetch support.');
  const request = gebcoFeatureInfoUrl(lat, lon, options);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Number(options.timeoutMs)) : 6500;
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal || controller.signal;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(request.url, {
      cache: options.cache || 'force-cache',
      signal
    });
    if (!response.ok) throw new Error(`GEBCO WMS HTTP ${response.status}`);
    const payload = await response.text();
    const match = payload.match(/value_list\s*=\s*'(-?\d+(?:\.\d+)?)/i);
    const elevationMeters = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(elevationMeters)) return normalizeDepthEvidence({ reason: 'gebco-response-without-elevation' });
    return createGebcoDepthEvidence(elevationMeters, {
      datasetRelease: options.datasetRelease,
      fetchedAt: options.fetchedAt || new Date().toISOString(),
      sampleWindowDegrees: request.sampleWindowDegrees
    });
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

export {
  DEPTH_TRUTH_TYPE,
  GEBCO_NOMINAL_GRID_ARC_SECONDS,
  GEBCO_VERTICAL_DATUM,
  GEBCO_WMS_ENDPOINT,
  GEBCO_WMS_LAYER,
  createGebcoDepthEvidence,
  fetchGebcoDepthEvidence,
  gebcoFeatureInfoUrl,
  normalizeDepthEvidence
};
