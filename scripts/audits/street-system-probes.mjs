// Read-only behavioral audit. Defects are observations, not passing release tests.
import { writeFileSync } from 'node:fs';
import { normalizeTransportSource } from '../../app/js/world/compiler/transport-source-normalizer.js';
import { linearFeatureVisualSpec } from '../../app/js/world/load-style.js';
import { normalizeLanduseSurfaceType } from '../../app/js/surface-rules.js';
import { compilePedestrianGraph } from '../../app/js/living-world/navigation-graphs.js';
const graphFor = tags => {
  const transportRecord = normalizeTransportSource({ id: 'audit-road' }, { highway: 'residential', width: '10', ...tags });
  return compilePedestrianGraph({
    traversal: { segments: [{ feature: { type: 'residential', width: 10, transportRecord },
      segIndex: 0, sourceTStart: 0, sourceTEnd: 1,
      p1: { x: 0, y: 0, z: 0 }, p2: { x: 20, y: 0, z: 0 } }] },
    sampleSurface: (_feature, _x, z) => z
  }).publication;
};
const left = graphFor({ sidewalk: 'left' });
const separate = graphFor({ 'sidewalk:both': 'separate' });
const point = left.edges[0]?.p1;
const width = linearFeatureVisualSpec({ kind: 'footway', subtype: 'sidewalk' }, { width: '6 ft' }).width;
const areaRoad = normalizeLanduseSurfaceType({ 'area:highway': 'residential' });
const areaSidewalk = normalizeLanduseSurfaceType({ 'area:highway': 'footway' });
const findings = [
  { id: 'width-units', observation: { input: '6 ft', returnedWidth: width, expectedMeters: 6 * 0.3048 },
    defectObserved: width === 6, explanation: 'Linear feature styling uses parseFloat and discards the explicit feet unit.' },
  { id: 'left-right', observation: { sourceDirection: 'east (+x), north is -z', firstLeftPoint: point },
    defectObserved: point?.z > 0, explanation: 'The left sidewalk is placed south of an eastbound way.' },
  { id: 'offset-height', observation: { returnedY: point?.y, heightAtShiftedPointPlusBias: point ? point.z + 0.08 : null },
    defectObserved: point ? Math.abs(point.y - (point.z + 0.08)) > 0.01 : false,
    explanation: 'Route elevation samples the road centerline before shifting sideways. This synthetic slope demonstrates the mismatch, not the slope of a real site.' },
  { id: 'per-side-separate', observation: { input: { 'sidewalk:both': 'separate' }, inferredDirectedEdges: separate.edges.length },
    defectObserved: separate.edges.length > 0, explanation: 'Per-side separate mapping is ignored by pedestrian inference, creating additional inferred sidewalks.' },
  { id: 'area-classification', observation: {
      road: areaRoad, sidewalk: areaSidewalk },
    defectObserved: areaRoad === 'paved' && areaSidewalk === 'paved', explanation: 'Both enter the same paved presentation category. This is semantic flattening, not proof that the original provider omitted their geometry.' }
];
const result = { schemaVersion: 1, purpose: 'Baseline defect reproduction; not release acceptance', findings };
writeFileSync(new URL('../../docs/streets/baseline-probes.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
