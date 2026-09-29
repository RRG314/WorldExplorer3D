import { resolveRegionalBuildingStyle } from './regional-building-style.js';
import { roofPlaneTriangles } from './roof-plane-geometry.js';
const NON_FLAT_ROOF_SHAPES = new Set([
  'dome',
  'gabled',
  'gambrel',
  'half-hipped',
  'hipped',
  'mansard',
  'onion',
  'pyramid',
  'pyramidal',
  'round',
  'skillion'
]);

const GENERIC_ROOF_MAX_HEIGHT_METERS = 24;
const GENERIC_ROOF_MAX_LEVELS = 6;
const GENERIC_ROOF_MAX_TOP_METERS = 32;
const CONTEXTUAL_PITCHED_BUILDING_TYPES = new Set([
  'house', 'dwelling_house', 'detached', 'semi', 'semidetached_house', 'bungalow', 'farmhouse', 'cabin'
]);

function numericValue(value, fallback = NaN) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function footprintMetrics(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let averageX = 0;
  let averageZ = 0;
  let signedAreaTwice = 0;
  let centroidXTimesArea = 0;
  let centroidZTimesArea = 0;
  for (const point of pts) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
    averageX += point.x;
    averageZ += point.z;
  }
  for (let index = 0; index < pts.length; index += 1) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    const cross = current.x * next.z - next.x * current.z;
    signedAreaTwice += cross;
    centroidXTimesArea += (current.x + next.x) * cross;
    centroidZTimesArea += (current.z + next.z) * cross;
  }
  const hasStableArea = Math.abs(signedAreaTwice) > 1e-5;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0.1, maxX - minX),
    depth: Math.max(0.1, maxZ - minZ),
    area: Math.abs(signedAreaTwice) * 0.5,
    centerX: hasStableArea ? centroidXTimesArea / (3 * signedAreaTwice) : averageX / pts.length,
    centerZ: hasStableArea ? centroidZTimesArea / (3 * signedAreaTwice) : averageZ / pts.length
  };
}

function isConvexFootprint(pts) {
  let winding = 0;
  for (let index = 0; index < pts.length; index += 1) {
    const a = pts[index];
    const b = pts[(index + 1) % pts.length];
    const c = pts[(index + 2) % pts.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-5) continue;
    const sign = Math.sign(cross);
    if (winding !== 0 && sign !== winding) return false;
    winding = sign;
  }
  return winding !== 0;
}

function stableRoofFootprint(shape, pts) {
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > 32) return false;
  if (pts.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.z))) return false;
  const metrics = footprintMetrics(pts);
  const boundingArea = metrics.width * metrics.depth;
  const longestSpan = Math.max(metrics.width, metrics.depth);
  const shortestSpan = Math.min(metrics.width, metrics.depth);
  if (shortestSpan < 1.2 || longestSpan > 180 || longestSpan / shortestSpan > 10) return false;
  if (!(metrics.area > 1.5) || metrics.area / boundingArea < 0.28) return false;
  // Apex and ridge fans are only valid on convex footprints. Concave and
  // multipart outlines receive a clean flat cap instead of diagonal sails.
  if (shape !== 'skillion' && !isConvexFootprint(pts)) return false;
  return true;
}

function longestEdgeAxis(pts) {
  let best = { x: 1, z: 0, length: 0 };
  for (let index = 0; index < pts.length; index++) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.hypot(dx, dz);
    if (length > best.length) best = { x: dx / length, z: dz / length, length };
  }
  return best;
}

// OSM roof:direction describes runoff, not the ridge. Local +X is east
// and +Z is south. Preserve numeric and 16-point compass observations.
function roofDirection(value) {
  const text = String(value ?? '').trim().toUpperCase();
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = compass.indexOf(text);
  if (index >= 0) return index * 22.5;
  if (!text) return NaN;
  const degrees = Number(text);
  return Number.isFinite(degrees) && degrees >= 0 && degrees <= 360 ? degrees : NaN;
}

function roofAxis(pts, tags) {
  const direction = roofDirection(tags['roof:direction']);
  if (Number.isFinite(direction)) {
    const radians = direction * Math.PI / 180;
    return { x: Math.cos(radians), z: Math.sin(radians) };
  }
  const axis = longestEdgeAxis(pts);
  return String(tags['roof:orientation'] || '').trim().toLowerCase() === 'across'
    ? { x: -axis.z, z: axis.x } : axis;
}

function pushTriangle(positions, a, b, c) {
  positions.push(
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z
  );
}

function geometryFromTriangles(positions) {
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function apexRoofGeometry(pts, roofHeight) {
  const metrics = footprintMetrics(pts);
  const apex = { x: metrics.centerX, y: roofHeight, z: metrics.centerZ };
  const positions = [];
  for (let index = 0; index < pts.length; index++) {
    const current = pts[index];
    const next = pts[(index + 1) % pts.length];
    pushTriangle(
      positions,
      { x: current.x, y: 0, z: current.z },
      { x: next.x, y: 0, z: next.z },
      apex
    );
  }
  return geometryFromTriangles(positions);
}

function skillionRoofGeometry(pts, roofHeight, tags) {
  const metrics = footprintMetrics(pts);
  const axis = roofAxis(pts, tags);
  const across = { x: -axis.z, z: axis.x };
  const projections = pts.map((point) =>
    (point.x - metrics.centerX) * across.x + (point.z - metrics.centerZ) * across.z
  );
  const minAcross = Math.min(...projections);
  const maxAcross = Math.max(...projections);
  const span = Math.max(0.1, maxAcross - minAcross);
  const contour = pts.map((point) => new THREE.Vector2(point.x, -point.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = [];
  const vertex = (index) => ({
    x: pts[index].x,
    y: (projections[index] - minAcross) / span * roofHeight,
    z: pts[index].z
  });
  for (const face of faces) pushTriangle(positions, vertex(face[0]), vertex(face[1]), vertex(face[2]));
  // The body stops at the low eave. Close the three raised perimeter walls
  // explicitly so approaching a single-slope building cannot expose its inside.
  for (let i = 0; i < pts.length; i++) {
    const a = vertex(i), b = vertex((i + 1) % pts.length);
    if (a.y > 1e-8) pushTriangle(positions, {...a, y: 0}, a, {...b, y: 0});
    if (b.y > 1e-8) pushTriangle(positions, a, b, {...b, y: 0});
  }
  return geometryFromTriangles(positions);
}

function domeRoofGeometry(pts, roofHeight) {
  const metrics = footprintMetrics(pts);
  const geometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(metrics.width * 0.5, roofHeight, metrics.depth * 0.5);
  geometry.translate(metrics.centerX, 0, metrics.centerZ);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function inferredRoofHeight(shape, heightMeters, pts, fullPartRoof) {
  const metrics = footprintMetrics(pts);
  const span = Math.min(metrics.width, metrics.depth);
  const curved = shape === 'dome' || shape === 'onion' || shape === 'round';
  const share = curved ? 0.34 : fullPartRoof ? 0.3 : 0.24;
  const maximum = curved ? 12 : 8;
  return Math.max(0.8, Math.min(heightMeters * 0.38, span * share, maximum));
}

export function resolveMappedRoof(tags = {}, heightMeters = 0, buildingSemantics = null, pts = [], context = {}) {
  const resolvedHeight = Math.max(0, Number(heightMeters) || 0);
  const baseOffset = Math.max(0, Number(buildingSemantics?.baseOffsetMeters) || 0);
  const mappedLevels = numericValue(tags['building:levels']);
  if (
    resolvedHeight > GENERIC_ROOF_MAX_HEIGHT_METERS ||
    baseOffset + resolvedHeight > GENERIC_ROOF_MAX_TOP_METERS ||
    (Number.isFinite(mappedLevels) && mappedLevels > GENERIC_ROOF_MAX_LEVELS)
  ) return null;
  const mappedShape = String(tags['roof:shape'] || '').trim().toLowerCase().replaceAll('_', '-');
  const shape = NON_FLAT_ROOF_SHAPES.has(mappedShape) ? mappedShape : '';
  if (!NON_FLAT_ROOF_SHAPES.has(shape)) {
    // Missing data can be inferred. Explicit flat or unsupported mapped shapes
    // must not silently turn into an invented residential gable.
    if (mappedShape) return null;
    const buildingType = String(tags.building || context.buildingType || '').trim().toLowerCase();
    const metrics = Array.isArray(pts) && pts.length >= 3 ? footprintMetrics(pts) : null;
    const levels = numericValue(tags['building:levels'], Number(context.levels));
    const contextualCandidate = CONTEXTUAL_PITCHED_BUILDING_TYPES.has(buildingType) &&
      context.denseUrban !== true &&
      resolvedHeight >= 2.8 && resolvedHeight <= 12 &&
      (!Number.isFinite(levels) || levels <= 3) &&
      metrics && metrics.area >= 28 && metrics.area <= 280 &&
      stableRoofFootprint('gabled', pts);
    if (!contextualCandidate) return null;
    const regionalStyle = resolveRegionalBuildingStyle({...context,tags,heightMeters:resolvedHeight});
    const recommendation = regionalStyle?.roof;
    const observedHeight = numericValue(tags['roof:height']);
    const hasObservedHeight = Number.isFinite(observedHeight) && observedHeight > 0;
    const roofHeight = hasObservedHeight ? Math.min(observedHeight, resolvedHeight) :
      Math.max(.8, Math.min(3.2, Math.min(metrics.width, metrics.depth) * (recommendation?.pitchRatio || .24), resolvedHeight * .3));
    return {
      shape: recommendation?.shape || 'gabled',
      color: recommendation?.color,
      material: recommendation?.material,
      regionalStyleId: recommendation ? regionalStyle.id : null,
      roofHeight,
      roofHeightSource: hasObservedHeight ? 'mapped' : 'context_modeled_from_footprint_span',
      roofShapeSource: 'context_inferred_explicit_lowrise_residential',
      wallHeight: Math.max(0, resolvedHeight - roofHeight),
      fullPartRoof: false
    };
  }
  if (!stableRoofFootprint(shape, pts)) return null;
  const mappedRoofHeight = numericValue(tags['roof:height']);
  const fullPartRoof = !!tags['building:part'] && Number(buildingSemantics?.baseOffsetMeters || 0) > 0.4;
  const roofHeight = Math.min(
    Math.max(0.3, resolvedHeight || 0.3),
    Number.isFinite(mappedRoofHeight) && mappedRoofHeight > 0 ?
      mappedRoofHeight :
      inferredRoofHeight(shape, heightMeters, pts, fullPartRoof)
  );
  return {
    shape,
    roofHeight,
    roofHeightSource: Number.isFinite(mappedRoofHeight) && mappedRoofHeight > 0 ? 'mapped' : 'shape_inferred',
    roofShapeSource: 'mapped',
    wallHeight: Math.max(0, heightMeters - roofHeight),
    fullPartRoof
  };
}

export function createMappedRoofMesh(pts, baseElevation, wallHeight, roofSpec, tags = {}, surface = null) {
  if (!roofSpec) return null;
  let geometry = null;
  if (roofSpec.shape === 'skillion') {
    geometry = skillionRoofGeometry(pts, roofSpec.roofHeight, tags);
  } else if (['dome', 'onion', 'round'].includes(roofSpec.shape)) {
    geometry = domeRoofGeometry(pts, roofSpec.roofHeight);
  } else if (['gabled', 'gambrel', 'half-hipped', 'hipped', 'mansard'].includes(roofSpec.shape)) {
    geometry = geometryFromTriangles(roofPlaneTriangles(pts, roofSpec.shape, roofSpec.roofHeight, roofAxis(pts, tags)));
  } else {
    geometry = apexRoofGeometry(pts, roofSpec.roofHeight);
  }
  if (!geometry) return null;
  const mappedColor = String(tags['roof:colour'] || tags['roof:color'] || '').trim();
  const validMappedColor = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(mappedColor) ||
    Object.hasOwn(THREE.Color.NAMES, mappedColor.toLowerCase());
  const color = validMappedColor ? mappedColor.toLowerCase() : roofSpec.color || '#686d72';
  if (surface?.map) {
    if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
    const position=geometry.getAttribute('position'), normal=geometry.getAttribute('normal'), uvs=[];
    const scale=1/Math.max(.1,Number(surface.physicalWidthMeters)||2);
    for(let i=0;i<position.count;i+=3){
      const n=new THREE.Vector3().fromBufferAttribute(normal,i);
      const u=new THREE.Vector3(n.z,0,-n.x);
      if(u.lengthSq()<1e-8)u.set(1,0,0);else u.normalize();
      const v=new THREE.Vector3().crossVectors(n,u).normalize();
      for(let j=0;j<3;j++){const p=new THREE.Vector3().fromBufferAttribute(position,i+j);uvs.push(p.dot(u)*scale,p.dot(v)*scale);}
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  }
  const material = new THREE.MeshStandardMaterial({
    map: surface?.map || null,
    color: surface?.map && !validMappedColor ? 0xffffff : color,
    roughness: /metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 0.62 : 0.9,
    metalness: /metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 0.22 : 0.03,
    side: THREE.DoubleSide
  });
  if(surface?.map){
    const gableColor=new THREE.Color(surface.gableColor ?? '#c4bcae');
    material.onBeforeCompile=shader=>{
      shader.uniforms.roofGableColor={value:gableColor};
      shader.vertexShader='varying float roofSlopeMask;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nroofSlopeMask=step(0.01,abs(objectNormal.y));');
      shader.fragmentShader='varying float roofSlopeMask; uniform vec3 roofGableColor;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(roofGableColor,diffuseColor.rgb,roofSlopeMask);');
    };
    material.customProgramCacheKey=()=> 'mapped-roof-surface-v1';
  }
  material.userData = {
    ...(material.userData || {}),
    buildingBatchKey: `building-roof:${surface?.id || 'plain'}:${surface?.gableColor ?? 'default'}:${roofSpec.roofShapeSource}:${roofSpec.shape}:${new THREE.Color(color).getHexString()}:${/metal/.test(String(tags['roof:material'] || '').toLowerCase()) ? 'metal' : 'solid'}`
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseElevation + Math.max(0, wallHeight);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isRoofDetail = true;
  mesh.userData.isMappedRoof = roofSpec.roofShapeSource === 'mapped';
  mesh.userData.isInferredRoof = roofSpec.roofShapeSource !== 'mapped';
  mesh.userData.roofShape = roofSpec.shape;
  mesh.userData.roofShapeSource = roofSpec.roofShapeSource;
  mesh.userData.roofHeight = roofSpec.roofHeight;
  mesh.userData.roofHeightSource = roofSpec.roofHeightSource;
  return mesh;
}
