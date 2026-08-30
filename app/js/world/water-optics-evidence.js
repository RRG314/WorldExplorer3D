import { normalizeDepthEvidence } from '../geospatial/bathymetry-evidence.js?v=1';
import { normalizeWaterKind } from './water-body-contract.js?v=4';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function modeledWaveEvidence(model = null) {
  if (!model || model.hasGuidance !== true) return Object.freeze({ truthType: 'unknown', sourceId: 'none' });
  const gridDistanceKm = numberOrNull(model.gridDistanceKm);
  return Object.freeze({
    truthType: 'modeled',
    sourceId: String(model.sourceId || model.provenance?.sourceId || 'open-meteo-marine'),
    validAt: String(model.validAt || model.provenance?.validAt || '') || null,
    fetchedAt: String(model.provenance?.fetchedAt || '') || null,
    gridDistanceKm,
    renderUsable: gridDistanceKm !== null && gridDistanceKm <= 35,
    waveHeightM: numberOrNull(model.waveHeightM),
    wavePeriodS: numberOrNull(model.wavePeriodS),
    waveDirectionDeg: numberOrNull(model.waveDirectionDeg),
    waveDirectionConvention: 'direction-waves-come-from',
    swellHeightM: numberOrNull(model.swellHeightM),
    swellPeriodS: numberOrNull(model.swellPeriodS),
    swellDirectionDeg: numberOrNull(model.swellDirectionDeg),
    currentVelocityKph: numberOrNull(model.currentVelocityKph),
    currentDirectionDeg: numberOrNull(model.currentDirectionDeg),
    currentDirectionConvention: 'direction-current-flows-to'
  });
}

function modeledWaveRenderControls(wave = null) {
  const waveHeightM = numberOrNull(wave?.waveHeightM);
  const wavePeriodS = numberOrNull(wave?.wavePeriodS);
  if (wave?.truthType !== 'modeled' || wave?.renderUsable !== true || waveHeightM === null) {
    return Object.freeze({ usable: false, sourceId: 'none', intensity: null, speedScale: null });
  }
  // This is a rendering transfer function, not a replacement measurement.
  // The source height and period remain unchanged in the evidence object.
  return Object.freeze({
    usable: true,
    sourceId: String(wave.sourceId || 'open-meteo-marine'),
    intensity: Math.max(0.06, Math.min(1, Math.sqrt(Math.max(0, waveHeightM) / 4))),
    speedScale: wavePeriodS !== null && wavePeriodS > 0
      ? Math.max(0.6, Math.min(1.45, 6 / wavePeriodS))
      : 1,
    waveHeightM,
    wavePeriodS,
    waveDirectionDeg: numberOrNull(wave.waveDirectionDeg),
    waveDirectionConvention: wave.waveDirectionConvention || 'direction-waves-come-from'
  });
}

function waterLevelEvidence(marine = null) {
  const observation = marine?.observation;
  if (observation && numberOrNull(observation.valueM) !== null) {
    return Object.freeze({
      truthType: 'observed',
      sourceId: String(observation.provenance?.sourceId || 'noaa-coops-observations'),
      stationId: String(observation.stationId || '') || null,
      stationName: String(observation.stationName || '') || null,
      valueM: numberOrNull(observation.valueM),
      datum: String(observation.datum || '') || null,
      quality: String(observation.quality || '') || null,
      observedAt: String(observation.observedAt || '') || null,
      fetchedAt: String(observation.provenance?.fetchedAt || '') || null,
      geometryOffsetAuthorized: false
    });
  }

  const prediction = Array.isArray(marine?.predictions) ? marine.predictions.find((item) => numberOrNull(item?.valueM) !== null) : null;
  if (prediction) {
    return Object.freeze({
      truthType: 'predicted',
      sourceId: String(prediction.provenance?.sourceId || 'noaa-coops-predictions'),
      stationId: String(prediction.stationId || '') || null,
      valueM: numberOrNull(prediction.valueM),
      datum: String(prediction.datum || '') || null,
      validAt: String(prediction.validAt || '') || null,
      fetchedAt: String(prediction.provenance?.fetchedAt || '') || null,
      geometryOffsetAuthorized: false
    });
  }

  const modeledLevel = numberOrNull(marine?.model?.seaLevelHeightMslM);
  if (modeledLevel !== null) {
    return Object.freeze({
      truthType: 'modeled',
      sourceId: String(marine.model.sourceId || 'open-meteo-marine'),
      valueM: modeledLevel,
      datum: 'model-mean-sea-level',
      validAt: String(marine.model.validAt || '') || null,
      fetchedAt: String(marine.model.provenance?.fetchedAt || '') || null,
      geometryOffsetAuthorized: false
    });
  }

  return Object.freeze({ truthType: 'unknown', sourceId: 'none', valueM: null, geometryOffsetAuthorized: false });
}

function resolveWaterOpticsEvidence(options = {}) {
  const body = options.waterBody || {};
  const bodyDepth = normalizeDepthEvidence(body.depthEvidence);
  const locationDepth = normalizeDepthEvidence(options.surfaceEvidence?.bathymetry);
  const depth = bodyDepth.truthType !== 'unknown' ? bodyDepth : locationDepth;
  const waterKind = normalizeWaterKind(body.waterKind || body.kind || options.waterKind) || 'lake';
  const geometryDataset = String(body.provenance?.dataset || body.geometrySource || '').trim();

  return Object.freeze({
    schemaVersion: 1,
    waterKind,
    geometry: Object.freeze({
      truthType: geometryDataset && geometryDataset !== 'unknown' ? 'mapped' : 'unknown',
      sourceId: geometryDataset || 'none',
      featureId: body.provenance?.featureId || body.sourceFeatureId || null
    }),
    depth,
    wave: modeledWaveEvidence(options.marine?.model),
    waterLevel: waterLevelEvidence(options.marine),
    visualFallback: Object.freeze({
      active: depth.truthType === 'unknown',
      profile: `${waterKind}-unknown-depth`,
      numericDepthUsed: depth.truthType !== 'unknown' && depth.depthMeters !== null
    })
  });
}

export {
  modeledWaveEvidence,
  modeledWaveRenderControls,
  resolveWaterOpticsEvidence,
  waterLevelEvidence
};
