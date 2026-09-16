function upwardTriangle(targetIndices, a, b, c, points) {
  const pointA = points[a];
  const pointB = points[b];
  const pointC = points[c];
  const area = (pointB.x - pointA.x) * (pointC.z - pointA.z) -
    (pointB.z - pointA.z) * (pointC.x - pointA.x);
  if (area > 0) targetIndices.push(a, c, b);
  else targetIndices.push(a, b, c);
  return Math.abs(area) * 0.5;
}

function surfacePoint(point, offsetX, offsetZ, sampleTerrainY, surfaceBias) {
  const x = Number(point.x) + offsetX;
  const z = Number(point.z) + offsetZ;
  const sampledY = Number(sampleTerrainY(x, z));
  return {
    x,
    y: Number.isFinite(sampledY) ? sampledY + surfaceBias : surfaceBias,
    z
  };
}

function appendPoint(targetVerts, points, point) {
  const index = targetVerts.length / 3;
  targetVerts.push(point.x, point.y, point.z);
  points.push(point);
  return index;
}

function segmentFrame(start, end) {
  const dx = Number(end.x) - Number(start.x);
  const dz = Number(end.z) - Number(start.z);
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-5)) return null;
  return {
    tangentX: dx / length,
    tangentZ: dz / length,
    normalX: -dz / length,
    normalZ: dx / length,
    length
  };
}

function appendTurnJoin({
  point,
  incoming,
  outgoing,
  leftDistance,
  rightDistance,
  sampleTerrainY,
  surfaceBias,
  targetVerts,
  targetIndices,
  geometryPoints
}) {
  const cross = incoming.tangentX * outgoing.tangentZ - incoming.tangentZ * outgoing.tangentX;
  const dot = Math.max(-1, Math.min(1,
    incoming.tangentX * outgoing.tangentX + incoming.tangentZ * outgoing.tangentZ
  ));
  const signedTurn = Math.atan2(cross, dot);
  const absoluteTurn = Math.abs(signedTurn);
  if (absoluteTurn < Math.PI / 180) return { joins: 0, triangles: 0, degenerateTriangles: 0 };

  const appendDisk = absoluteTurn > Math.PI * 0.94;
  // The segment rectangles already overlap on the inside of a turn. The
  // uncovered wedge is on the opposite (outer) side: right for a left turn,
  // left for a right turn. Filling the signed-turn side here produced the
  // long triangular holes visible between otherwise valid road segments.
  const side = cross >= 0 ? -1 : 1;
  const radius = side > 0 ? leftDistance : rightDistance;
  const startAngle = appendDisk
    ? 0
    : Math.atan2(incoming.normalZ * side, incoming.normalX * side);
  const sweep = appendDisk ? Math.PI * 2 : signedTurn;
  const segmentCount = appendDisk
    ? 16
    : Math.max(1, Math.min(8, Math.ceil(absoluteTurn / (Math.PI / 8))));
  const center = surfacePoint(point, 0, 0, sampleTerrainY, surfaceBias + 0.002);
  const centerIndex = appendPoint(targetVerts, geometryPoints, center);
  const ring = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = startAngle + sweep * index / segmentCount;
    ring.push(appendPoint(
      targetVerts,
      geometryPoints,
      surfacePoint(
        point,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        sampleTerrainY,
        surfaceBias + 0.002
      )
    ));
  }
  let degenerateTriangles = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (upwardTriangle(
      targetIndices,
      centerIndex,
      ring[index],
      ring[index + 1],
      geometryPoints
    ) <= 1e-7) degenerateTriangles += 1;
  }
  return {
    joins: 1,
    triangles: ring.length - 1,
    degenerateTriangles
  };
}

export function roadTurnFootprint({ previous, point, next, leftDistance, rightDistance }) {
  const incoming = segmentFrame(previous, point), outgoing = segmentFrame(point, next);
  if (!incoming || !outgoing) return [];
  const targetVerts = [], targetIndices = [], geometryPoints = [];
  appendTurnJoin({ point, incoming, outgoing, leftDistance, rightDistance,
    sampleTerrainY: () => 0, surfaceBias: 0, targetVerts, targetIndices, geometryPoints });
  const polygons = [];
  for (let i=0;i<targetIndices.length;i+=3) {
    const ring = targetIndices.slice(i,i+3).map(j=>[targetVerts[j*3],targetVerts[j*3+2]]);
    polygons.push([ring.concat([ring[0]])]);
  }
  return polygons;
}
