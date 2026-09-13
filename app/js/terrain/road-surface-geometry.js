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

// Corner-only road quads can cut through the rendered terrain between their
// corners. Refine only triangles whose sampled interior disagrees with their
// plane; planar streets retain their original geometry and cost.
export function conformRoadTriangles(vertices, indices, sampleY, surfaceBias, {maxDepth=3,tolerance=.06,edgeRefinement=false}={}) {
  const points=[];
  for(let i=0;i<vertices.length;i+=3)points.push({x:vertices[i],y:vertices[i+1],z:vertices[i+2],index:i/3});
  const samples=new Map(),result=[];
  const sample=(x,z)=>{
    const key=`${x.toFixed(6)}:${z.toFixed(6)}`;
    if(!samples.has(key))samples.set(key,{x,z,y:sampleY(x,z)+surfaceBias,index:null});
    return samples.get(key);
  };
  const add=p=>{
    if(p.index===null){p.index=vertices.length/3;vertices.push(p.x,p.y,p.z);}
    return p.index;
  };
  const emit=(a,b,c,depth,minEdge=0)=>{
    if(depth>=(edgeRefinement?maxDepth*3:maxDepth)){result.push(add(a),add(b),add(c));return;}
    const ab=sample((a.x+b.x)/2,(a.z+b.z)/2),bc=sample((b.x+c.x)/2,(b.z+c.z)/2),ca=sample((c.x+a.x)/2,(c.z+a.z)/2);
    const center=sample((a.x+b.x+c.x)/3,(a.z+b.z+c.z)/3);
    const error=Math.max(Math.abs(ab.y-(a.y+b.y)/2),Math.abs(bc.y-(b.y+c.y)/2),Math.abs(ca.y-(c.y+a.y)/2),Math.abs(center.y-(a.y+b.y+c.y)/3));
    if(!Number.isFinite(error) || error<=tolerance){result.push(add(a),add(b),add(c));return;}
    if(edgeRefinement){
      // A long, narrow frontage triangle often crosses just one terrain bend.
      // Splitting all three edges repeatedly creates 64 children regardless of
      // which edge needs detail. Bisect only an offending edge, using the same
      // minimum spatial scale as the original uniform refinement.
      const edges=[[a,b,c,ab],[b,c,a,bc],[c,a,b,ca]].map(([p,q,r,m])=>({p,q,r,m,length:Math.hypot(p.x-q.x,p.z-q.z),error:Math.abs(m.y-(p.y+q.y)/2)}));
      if(!minEdge)minEdge=Math.max(...edges.map(e=>e.length))/2**maxDepth;
      const offending=edges.filter(e=>e.error>tolerance&&e.length>minEdge).sort((a,b)=>b.length-a.length)[0];
      if(offending){const {p,q,r,m}=offending;emit(p,m,r,depth+1,minEdge);emit(m,q,r,depth+1,minEdge);return;}
      if(Math.abs(center.y-(a.y+b.y+c.y)/3)>tolerance&&edges.some(e=>e.length>minEdge)){
        emit(a,b,center,depth+1,minEdge);emit(b,c,center,depth+1,minEdge);emit(c,a,center,depth+1,minEdge);return;
      }
      result.push(add(a),add(b),add(c));return;
    }
    emit(a,ab,ca,depth+1);emit(ab,b,bc,depth+1);emit(ca,bc,c,depth+1);emit(ab,bc,ca,depth+1);
  };
  for(let i=0;i<indices.length;i+=3)emit(points[indices[i]],points[indices[i+1]],points[indices[i+2]],0);
  indices.length=0;
  for(const index of result)indices.push(index);
  return result.length/3;
}

function appendSolidAtGradeRoadGeometry({
  feature,
  points,
  halfWidth,
  widthSamplesMeters = null,
  sampleTerrainY,
  surfaceBias = 0.18,
  targetVerts = [],
  targetIndices = []
} = {}) {
  if (
    !feature ||
    !Array.isArray(points) ||
    points.length < 2 ||
    !(Number(halfWidth) > 0) ||
    typeof sampleTerrainY !== 'function'
  ) {
    return Object.freeze({
      segmentQuads: 0,
      turnJoins: 0,
      surfaceTriangles: 0,
      foldedTriangles: 0,
      degenerateTriangles: 0
    });
  }

  const offset = Number(
    feature?.transportRecord?.crossSection?.placement?.centerlineOffsetMeters
  ) || 0;
  const widthAt = (index) => {
    const sampledWidth = Number(widthSamplesMeters?.[index]);
    return Number.isFinite(sampledWidth) && sampledWidth > 0
      ? sampledWidth
      : Number(halfWidth) * 2;
  };
  const geometryPoints = [];
  const frames = [];
  let segmentQuads = 0;
  let surfaceTriangles = 0;
  let foldedTriangles = 0;
  let degenerateTriangles = 0;
  let turnJoins = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const frame = segmentFrame(start, end);
    frames[index] = frame;
    if (!frame) continue;
    const startHalfWidth = widthAt(index) * 0.5;
    const endHalfWidth = widthAt(index + 1) * 0.5;
    const startLeftDistance = Math.max(0.3, startHalfWidth + offset);
    const startRightDistance = Math.max(0.3, startHalfWidth - offset);
    const endLeftDistance = Math.max(0.3, endHalfWidth + offset);
    const endRightDistance = Math.max(0.3, endHalfWidth - offset);
    const indices = [
      appendPoint(targetVerts, geometryPoints, surfacePoint(start, frame.normalX * startLeftDistance, frame.normalZ * startLeftDistance, sampleTerrainY, surfaceBias)),
      appendPoint(targetVerts, geometryPoints, surfacePoint(start, -frame.normalX * startRightDistance, -frame.normalZ * startRightDistance, sampleTerrainY, surfaceBias)),
      appendPoint(targetVerts, geometryPoints, surfacePoint(end, frame.normalX * endLeftDistance, frame.normalZ * endLeftDistance, sampleTerrainY, surfaceBias)),
      appendPoint(targetVerts, geometryPoints, surfacePoint(end, -frame.normalX * endRightDistance, -frame.normalZ * endRightDistance, sampleTerrainY, surfaceBias))
    ];
    const firstArea = upwardTriangle(targetIndices, indices[0], indices[2], indices[1], geometryPoints);
    const secondArea = upwardTriangle(targetIndices, indices[1], indices[2], indices[3], geometryPoints);
    if (firstArea <= 1e-7) degenerateTriangles += 1;
    if (secondArea <= 1e-7) degenerateTriangles += 1;
    // Independent segment rectangles cannot geometrically fold. Keep this
    // explicit diagnostic so a future index/order rewrite cannot hide one.
    if (firstArea < 0 || secondArea < 0) foldedTriangles += 1;
    segmentQuads += 1;
    surfaceTriangles += 2;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const incoming = frames[index - 1];
    const outgoing = frames[index];
    if (!incoming || !outgoing) continue;
    const pointHalfWidth = widthAt(index) * 0.5;
    const join = appendTurnJoin({
      point: points[index],
      incoming,
      outgoing,
      leftDistance: Math.max(0.3, pointHalfWidth + offset),
      rightDistance: Math.max(0.3, pointHalfWidth - offset),
      sampleTerrainY,
      surfaceBias,
      targetVerts,
      targetIndices,
      geometryPoints
    });
    turnJoins += join.joins;
    surfaceTriangles += join.triangles;
    degenerateTriangles += join.degenerateTriangles;
  }

  surfaceTriangles=conformRoadTriangles(targetVerts,targetIndices,sampleTerrainY,surfaceBias);
  return Object.freeze({
    segmentQuads,
    turnJoins,
    surfaceTriangles,
    foldedTriangles,
    degenerateTriangles
  });
}

export { appendSolidAtGradeRoadGeometry };

// Planar footprint of the exact turn join used by the road renderer. Pavement
// subtraction consumes this rather than inventing a second road corner shape.
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
