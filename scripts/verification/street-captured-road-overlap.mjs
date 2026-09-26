import { readFileSync } from 'node:fs';

// Independent convex clipping of captured, rendered road triangles. This does
// not reuse the road compiler or its polygon union, so overlapping output can
// fail even when every compiler count and coverage assertion succeeds.
const signedArea = (ring) => ring.reduce((sum, a, i) => {
  const b = ring[(i + 1) % ring.length];
  return sum + a.x * b.z - b.x * a.z;
}, 0) / 2;

function intersectTriangle(polygon, triangle) {
  const sign = Math.sign(signedArea(triangle));
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = triangle[edge], b = triangle[(edge + 1) % 3];
    const side = p => sign * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
    const next = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const u = side(p), v = side(q);
      if (u >= 0) next.push(p);
      if ((u >= 0) !== (v >= 0)) {
        const t = u / (u - v);
        next.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
    polygon = next;
  }
  return polygon;
}

export function auditCapturedRoadOverlap(capture, areaTolerance = 1e-6) {
  const triangles = capture.surfaces.filter(surface => surface.family === 'road').flatMap(surface => surface.triangles);
  const degenerateTriangles = triangles.filter(triangle => Math.abs(signedArea(triangle)) <= 1e-12).length;
  const bounds = triangles.map((triangle, index) => ({
    index,
    minX: Math.min(...triangle.map(p => p.x)), maxX: Math.max(...triangle.map(p => p.x)),
    minZ: Math.min(...triangle.map(p => p.z)), maxZ: Math.max(...triangle.map(p => p.z))
  })).filter(entry => Math.abs(signedArea(triangles[entry.index])) > 1e-12).sort((a, b) => a.minX - b.minX);
  let overlappingPairs = 0, pairwiseOverlapArea = 0, maximumPairArea = 0;
  const examples = [];
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i];
    for (let j = i + 1; j < bounds.length && bounds[j].minX < a.maxX; j++) {
      const b = bounds[j];
      if (a.minZ >= b.maxZ || b.minZ >= a.maxZ) continue;
      const area = Math.abs(signedArea(intersectTriangle(triangles[a.index], triangles[b.index])));
      if (area <= areaTolerance) continue;
      overlappingPairs++;
      pairwiseOverlapArea += area;
      maximumPairArea = Math.max(maximumPairArea, area);
      if (examples.length < 20) examples.push({ left: a.index, right: b.index, area });
    }
  }
  return { triangles: triangles.length, degenerateTriangles, overlappingPairs, pairwiseOverlapArea, maximumPairArea, areaTolerance, examples,
    scope: 'Captured road triangles only. Intentional grade-separated crossings require separate layer review.' };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  if (!process.argv[2]) throw new Error('Provide a saved street surface capture JSON path.');
  const report = auditCapturedRoadOverlap(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify({ source: process.argv[2], ...report }, null, 2));
  if (!report.triangles || report.overlappingPairs) process.exitCode = 1;
}
