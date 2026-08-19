import assert from 'node:assert/strict';
import {
  createGebcoDepthEvidence,
  fetchGebcoDepthEvidence,
  normalizeDepthEvidence
} from '../app/js/geospatial/bathymetry-evidence.js';
import { normalizeWaterBody } from '../app/js/world/water-body-contract.js';
import {
  modeledWaveRenderControls,
  resolveWaterOpticsEvidence
} from '../app/js/world/water-optics-evidence.js';

const unknown = normalizeDepthEvidence({
  truthType: 'unknown',
  depthMeters: 0.6,
  sourceId: 'water-terrain-mask',
  reason: 'visual-bed-clearance-only'
});
assert.equal(unknown.truthType, 'unknown');
assert.equal(unknown.depthMeters, null, 'visual bed clearance must never become numeric bathymetry');

const gebco = createGebcoDepthEvidence(-4312, { fetchedAt: '2026-08-18T12:00:00.000Z' });
assert.equal(gebco.truthType, 'modeled');
assert.equal(gebco.depthMeters, 4312);
assert.equal(gebco.verticalDatum, 'assumed-mean-sea-level');
assert.equal(gebco.nominalGridArcSeconds, 15);
assert.equal(gebco.navigationSafe, false);
assert.match(gebco.qualityClass, /without-tid/);

const mocked = await fetchGebcoDepthEvidence(0, -30, {
  fetchedAt: '2026-08-18T12:00:00.000Z',
  fetchImpl: async () => ({
    ok: true,
    text: async () => "GetFeatureInfo results:\nvalue_list = '-4275'"
  })
});
assert.equal(mocked.elevationMeters, -4275);
assert.equal(mocked.depthMeters, 4275);
assert.equal(mocked.truthType, 'modeled');

const mappedHarbor = normalizeWaterBody({
  shape: 'area',
  pts: [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }, { x: 0, z: 200 }],
  kindHint: 'harbor',
  geometrySource: 'OSM Shortbread vector tiles'
});
assert.equal(mappedHarbor.depthEvidence.depthMeters, null);
assert.equal(mappedHarbor.depthConfidence, 'unknown');

const optics = resolveWaterOpticsEvidence({
  waterBody: mappedHarbor,
  marine: {
    model: {
      hasGuidance: true,
      sourceId: 'open-meteo-marine',
      gridDistanceKm: 4.8,
      waveHeightM: 1.2,
      wavePeriodS: 7,
      waveDirectionDeg: 230,
      currentVelocityKph: 1.1,
      currentDirectionDeg: 45
    },
    observation: {
      stationId: '8574680',
      stationName: 'Baltimore',
      valueM: 0.42,
      datum: 'MLLW',
      quality: 'preliminary',
      observedAt: '2026-08-18T12:00:00.000Z',
      provenance: { sourceId: 'noaa-coops-observations' }
    }
  }
});
assert.equal(optics.geometry.truthType, 'mapped');
assert.equal(optics.depth.truthType, 'unknown');
assert.equal(optics.visualFallback.active, true);
assert.equal(optics.visualFallback.numericDepthUsed, false);
assert.equal(optics.wave.truthType, 'modeled');
assert.equal(optics.wave.waveDirectionConvention, 'direction-waves-come-from');
assert.equal(optics.wave.currentDirectionConvention, 'direction-current-flows-to');
assert.equal(optics.wave.renderUsable, true);
const waveControls = modeledWaveRenderControls(optics.wave);
assert.equal(waveControls.usable, true);
assert.equal(waveControls.waveHeightM, 1.2);
assert.equal(modeledWaveRenderControls({ ...optics.wave, gridDistanceKm: 80, renderUsable: false }).usable, false);
assert.equal(optics.waterLevel.truthType, 'observed');
assert.equal(optics.waterLevel.datum, 'MLLW');
assert.equal(optics.waterLevel.geometryOffsetAuthorized, false);
assert.equal(optics.waterLevel.valueM, 0.42);
assert.notEqual(optics.waterLevel.valueM, optics.depth.depthMeters, 'water level must never be treated as depth');

console.log(JSON.stringify({
  ok: true,
  contract: 'water-measurement-evidence',
  unknownDepthRemainsNull: true,
  gebcoTruthType: gebco.truthType,
  waterLevelMovesGeometry: optics.waterLevel.geometryOffsetAuthorized,
  modeledWaveDrivesRendering: waveControls.usable,
  directions: {
    waves: optics.wave.waveDirectionConvention,
    currents: optics.wave.currentDirectionConvention
  }
}, null, 2));
