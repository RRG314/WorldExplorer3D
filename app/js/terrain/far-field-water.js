import { resolveWaterSurfaceVisualProfile } from '../world/load-geometry.js?v=24';
import { registerWaterWaveMaterial } from '../world/water-materials.js?v=1';

const FAR_WATER_SURFACE_CLEARANCE_WORLD = 0.04;
const FAR_WATER_TERRAIN_MASK_SIZE = 4096;

function worldRing(appCtx, ring) {
  const withoutClosure = ring?.length > 1 &&
    ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : (ring || []).slice();
  return withoutClosure.map((coordinate) => {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const world = appCtx.geoToWorld(lat, lon);
    return new THREE.Vector2(world.x, world.z);
  }).filter(Boolean);
}

function buildFarWaterGeometry(appCtx, mappedContext) {
  const positions = [];
  const indices = [];
  const unitsPerMeter = Number(appCtx.WORLD_UNITS_PER_METER || 1);
  const yExaggeration = Number(appCtx.TERRAIN_Y_EXAGGERATION || 1);
  let polygons = 0;
  const publishedAreaIdentities = new Set();
  const waterAreas = [...(mappedContext?.waterAreas || [])].sort((left, right) => {
    const oceanPriority = Number(right?.kind === 'ocean') - Number(left?.kind === 'ocean');
    return oceanPriority || Number(right?.spanMeters || 0) - Number(left?.spanMeters || 0);
  });

  for (const area of waterAreas) {
    if (!Number.isFinite(area.surfaceMeters)) continue;
    const contour = worldRing(appCtx, area.outer);
    const holes = (area.holes || []).map((ring) => worldRing(appCtx, ring)).filter((ring) => ring.length >= 3);
    if (contour.length < 3) continue;
    const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
    if (!triangles.length) continue;
    const points = [contour, ...holes].flat();
    const y = area.surfaceMeters * unitsPerMeter * yExaggeration + FAR_WATER_SURFACE_CLEARANCE_WORLD;
    for (const triangle of triangles) {
      const baseIndex = positions.length / 3;
      // XY-to-XZ changes handedness, so reverse the winding to match the
      // upward-facing detailed mapped-water geometry and its lighting.
      for (const pointIndex of [triangle[0], triangle[2], triangle[1]]) {
        positions.push(points[pointIndex].x, y, points[pointIndex].y);
      }
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    }
    polygons += 1;
    if (area.identity) publishedAreaIdentities.add(String(area.identity));
  }

  if (!polygons) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, polygons, triangles: indices.length / 3, publishedAreaIdentities };
}

function buildMappedWaterTerrainOwnershipMask(appCtx, mappedContext, spec, publishedAreaIdentities = null) {
  if (!spec?.outer || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = FAR_WATER_TERRAIN_MASK_SIZE;
  canvas.height = FAR_WATER_TERRAIN_MASK_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const xRange = spec.outer.maxX - spec.outer.minX;
  const zRange = spec.outer.maxZ - spec.outer.minZ;
  if (!(xRange > 0 && zRange > 0)) return null;
  const canvasPoint = (coordinate) => {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const world = appCtx.geoToWorld(lat, lon);
    return {
      x: (world.x - spec.outer.minX) / xRange * canvas.width,
      y: (world.z - spec.outer.minZ) / zRange * canvas.height
    };
  };
  const appendRing = (ring) => {
    let started = false;
    for (const coordinate of ring || []) {
      const point = canvasPoint(coordinate);
      if (!point) continue;
      if (!started) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
      started = true;
    }
    if (started) context.closePath();
    return started;
  };

  // White publishes terrain. Black delegates the exact mapped footprint to
  // water, so a coarse terrain triangle cannot bridge a narrow mapped river.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  let polygons = 0;
  for (const area of mappedContext?.waterAreas || []) {
    if (!Number.isFinite(Number(area?.surfaceMeters))) continue;
    // Terrain may delegate only to water geometry that was actually
    // triangulated and published. Masking every source polygon created literal
    // sky holes wherever malformed/unsupported rings produced no water mesh.
    if (
      publishedAreaIdentities instanceof Set &&
      (!area?.identity || !publishedAreaIdentities.has(String(area.identity)))
    ) continue;
    context.beginPath();
    if (!appendRing(area.outer)) continue;
    for (const hole of area.holes || []) appendRing(hole);
    context.fill('evenodd');
    polygons += 1;
  }

  // Detailed terrain has its own exact mapped-water mask. The regional mask
  // applies only where regional terrain exists.
  if (spec.inner) {
    const x = (spec.inner.minX - spec.outer.minX) / xRange * canvas.width;
    const y = (spec.inner.minZ - spec.outer.minZ) / zRange * canvas.height;
    const width = (spec.inner.maxX - spec.inner.minX) / xRange * canvas.width;
    const height = (spec.inner.maxZ - spec.inner.minZ) / zRange * canvas.height;
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, width, height);
  }
  if (polygons === 0) return null;
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  // The canvas already owns a GPU-ready RGBA buffer whose red channel is the
  // mask. Converting 16.7 million pixels into a second red-only array blocked
  // Chrome for several seconds on large locations without saving peak memory.
  const texture = new THREE.DataTexture(rgba, canvas.width, canvas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'FarMappedWaterTerrainOwnershipMask';
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (typeof THREE.NoColorSpace !== 'undefined') texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, polygons, size: canvas.width };
}

function applyMappedWaterTerrainOwnership(mesh, material, ownership) {
  const geometry = mesh?.geometry;
  if (!ownership?.texture || !geometry?.attributes?.uv || !material) return false;
  geometry.setAttribute('mappedWaterOwnershipUv', geometry.attributes.uv);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader, renderer);
    shader.uniforms.mappedWaterTerrainOwnershipMask = { value: ownership.texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 mappedWaterOwnershipUv;\nvarying vec2 vMappedWaterOwnershipUv;')
      .replace('#include <begin_vertex>', 'vMappedWaterOwnershipUv = mappedWaterOwnershipUv;\n#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mappedWaterTerrainOwnershipMask;\nvarying vec2 vMappedWaterOwnershipUv;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (texture2D(mappedWaterTerrainOwnershipMask, vMappedWaterOwnershipUv).r < 0.35) discard;');
  };
  material.customProgramCacheKey = () => 'fixed-location-terrain-mapped-water-fragment-mask-v1';
  material.needsUpdate = true;
  mesh.userData.mappedWaterOwnershipMask = ownership.texture;
  mesh.userData.mappedWaterOwnership = {
    authority: 'published-water-geometry-fragment-mask',
    polygons: ownership.polygons,
    size: ownership.size,
    format: 'rgba8-red-channel',
    shaderDiscard: true,
    delegationRule: 'published-water-geometry-only'
  };
  return true;
}

function createFarWaterMesh(builtWater, contextHalfExtentMeters) {
  if (!builtWater?.geometry) return null;
  const waterStyle = resolveWaterSurfaceVisualProfile();
  const material = new THREE.MeshStandardMaterial({
    color: waterStyle.color,
    emissive: waterStyle.emissive,
    emissiveIntensity: waterStyle.emissiveIntensity,
    roughness: waterStyle.roughness,
    metalness: waterStyle.metalness,
    side: THREE.DoubleSide,
    fog: true,
    transparent: false,
    depthWrite: true,
    polygonOffset: false
  });
  registerWaterWaveMaterial(material, {
    waveScale: 1,
    waveBase: 1,
    area: Math.pow(contextHalfExtentMeters * 2, 2),
    span: contextHalfExtentMeters * 2,
    waterKind: 'open_ocean'
  });
  const mesh = new THREE.Mesh(builtWater.geometry, material);
  mesh.name = 'FarMappedWaterContext';
  mesh.renderOrder = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isFarMappedWaterContext = true;
  mesh.userData.visualOwnership = 'shared-mapped-water-profile';
  mesh.userData.coverageOwnership = 'continuous-regional-baseline-with-detailed-refinement';
  mesh.userData.renderProvenance = {
    version: 1,
    profile: 'far-mapped-water-polygon-lod',
    provider: 'openstreetmap',
    dataset: 'Shortbread mapped ocean and water polygons',
    layer: 'water',
    role: 'far-context-water-lod',
    sources: ['openstreetmap-shortbread'],
    fallback: false
  };
  return mesh;
}

export {
  FAR_WATER_SURFACE_CLEARANCE_WORLD,
  FAR_WATER_TERRAIN_MASK_SIZE,
  applyMappedWaterTerrainOwnership,
  buildFarWaterGeometry,
  buildMappedWaterTerrainOwnershipMask,
  createFarWaterMesh
};
