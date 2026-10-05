import { performance } from 'node:perf_hooks';
import { compileBuildingProvenance as afterBuilding } from '../../app/js/world/building-provenance-model.js';
import { createTransportSourceNormalizer } from '../../app/js/world/compiler/transport-source-normalizer.js';
import { compileBuildingProvenance as beforeBuilding } from '../../tests/fixtures/building-provenance-before-sharing.js';
import { normalizeTransportSource as beforeRoad } from '../../tests/fixtures/transport-source-before-sharing.js';

if (!globalThis.gc) throw Error('Run this isolated generated-data probe with --expose-gc');
const variant = process.argv[2];
if (!['before', 'after'].includes(variant)) throw Error('Choose before or after');
const compile = variant === 'before' ? beforeBuilding : afterBuilding;
const normalize = variant === 'before' ? beforeRoad : createTransportSourceNormalizer();
globalThis.gc(); const baseline = process.memoryUsage().heapUsed, started = performance.now();
const roads = [], buildings = [];
for (let i = 0; i < 18758; i++) {
  roads.push(normalize({ id:i, providerNamespace:i%3?'osm':'shortbread', completeness:i%3?'lossless':'generalized', geometryProvenance:i%3?'osm-overpass':'shortbread-v1' },
    { highway:['residential','primary','secondary','service','footway','motorway'][i%6], _sourceFeatureId:`test:way:${i}`, name:`Road ${i}`,
      ...(i%7?{}:{bridge:'yes',layer:'1'}), ...(i%11?{}:{'parking:lane:both':'parallel',sidewalk:'both',lanes:'2'}) }));
}
for (let i = 0; i < 25529; i++) buildings.push(compile({ _sourceFeatureId:`test:building:${i}`, _geometrySource:'overture', building:'yes',
  ...(i%7?{}:{name:`Building ${i}`}), ...(i%13?{}:{'building:levels':'4','roof:shape':'flat'}) },
  {heightMeters:8+i%80,levels:3,baseOffsetMeters:0,foundationBaseY:i%100}));
const compileMs = performance.now()-started;
globalThis.gc(); const retainedMiB = (process.memoryUsage().heapUsed-baseline)/1048576;
const seen = new Set();
function count(value) { if (!value || typeof value !== 'object' || seen.has(value)) return; seen.add(value); Object.values(value).forEach(count); }
roads.forEach(count); buildings.forEach(count);
console.log(JSON.stringify({scope:'Generated immutable metadata cohort only; not live-world heap or frame-time acceptance',variant,roads:roads.length,buildings:buildings.length,compileMs,retainedMiB,uniqueObjects:seen.size}));
