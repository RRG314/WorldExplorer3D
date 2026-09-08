import {
  appendGeometryWithTransform,
  buildMergedGeometry
} from './geometry-batching.js?v=6';
import { buildingExteriorCatalogSnapshot } from './building-exterior-catalog.js?v=1';

const DETAIL_LIMITS = Object.freeze({ low: 0, performance: 72, balanced: 150, quality: 240 });
const DETAIL_RADIUS = Object.freeze({ low: 0, performance: 115, balanced: 180, quality: 235 });

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function tierForContext(appCtx, requested) {
  const tier = String(requested || appCtx?.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  if (tier === 'low') return 'low';
  if (tier === 'performance') return 'performance';
  if (tier === 'quality' || tier === 'high') return 'quality';
  return 'balanced';
}

function footprintCenter(points) {
  return points.reduce((center, point) => ({
    x: center.x + finite(point?.x) / points.length,
    z: center.z + finite(point?.z) / points.length
  }), { x: 0, z: 0 });
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-8
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0.5;
  const x = start.x + dx * t;
  const z = start.z + dz * t;
  return { x, z, t, distance: Math.hypot(point.x - x, point.z - z) };
}

function facadeEdgeForMesh(appCtx, mesh, entrance) {
  const points = Array.isArray(mesh?.userData?.buildingFootprint) ? mesh.userData.buildingFootprint : [];
  if (points.length < 3) return null;
  const center = footprintCenter(points);
  let best = null;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = finite(end?.x) - finite(start?.x);
    const dz = finite(end?.z) - finite(start?.z);
    const length = Math.hypot(dx, dz);
    if (length < 2.1) continue;
    const midpoint = { x: (finite(start?.x) + finite(end?.x)) * 0.5, z: (finite(start?.z) + finite(end?.z)) * 0.5 };
    const entranceProjection = entrance ? pointSegmentDistance(entrance, start, end) : null;
    let roadDistance = Infinity;
    if (!entrance && typeof appCtx?.findNearestRoad === 'function') {
      const road = appCtx.findNearestRoad(midpoint.x, midpoint.z, {
        y: finite(mesh?.position?.y),
        maxVerticalDelta: 5.5
      });
      roadDistance = Number.isFinite(road?.dist) ? Number(road.dist) : Infinity;
    }
    const fallbackDistance = Math.hypot(midpoint.x, midpoint.z);
    const score = entranceProjection ? entranceProjection.distance : Number.isFinite(roadDistance) ? roadDistance : fallbackDistance;
    if (!best || score < best.score || (score === best.score && length > best.length)) {
      let normalX = -dz / length;
      let normalZ = dx / length;
      if ((midpoint.x - center.x) * normalX + (midpoint.z - center.z) * normalZ < 0) {
        normalX *= -1;
        normalZ *= -1;
      }
      best = {
        index,
        score,
        length,
        x: midpoint.x,
        z: midpoint.z,
        tangentX: dx / length,
        tangentZ: dz / length,
        normalX,
        normalZ,
        // Detail boxes use local X for width. A Y rotation maps it to
        // (cos(yaw), -sin(yaw)) in world X/Z, not the local-Z heading.
        yaw: Math.atan2(-dz, dx)
      };
    }
  }
  return best;
}

function createDetailMaterials() {
  const make = (key, color, roughness, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    material.name = `building-exterior-detail:${key}`;
    material.userData = {
      buildingExteriorDetail: true,
      buildingBatchKey: `building-exterior-detail:${key}`,
      sourceClaim: 'generated-visual-representation'
    };
    return material;
  };
  return new Map([
    ['trim', make('trim', 0xaaa69c, 0.86)],
    ['dark-metal', make('dark-metal', 0x343c40, 0.62, 0.34)],
    ['glass', make('glass', 0x405765, 0.32, 0.16)],
    ['awning-red', make('awning-red', 0x8e3d37, 0.82)],
    ['awning-blue', make('awning-blue', 0x365b70, 0.8)],
    ['awning-ochre', make('awning-ochre', 0xa77b38, 0.84)]
  ]);
}

function createBatchMap(materials) {
  return new Map([...materials.keys()].map((key) => [key, { positions: [], normals: [], uvs: [], indices: [] }]));
}

function boxAppender(unitBox, batches, counters) {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const axis = new THREE.Vector3(0, 1, 0);
  return (materialKey, width, height, depth, x, y, z, yaw = 0) => {
    if (!(width > 0.025 && height > 0.025 && depth > 0.025)) return false;
    const batch = batches.get(materialKey);
    if (!batch) return false;
    position.set(x, y, z);
    scale.set(width, height, depth);
    quaternion.setFromAxisAngle(axis, yaw);
    matrix.compose(position, quaternion, scale);
    const appended = appendGeometryWithTransform(batch, unitBox, matrix);
    if (appended <= 0) return false;
    counters.boxes += 1;
    counters.vertices += appended;
    return true;
  };
}

function facadePoint(edge, tangentOffset, outwardOffset) {
  return {
    x: edge.x + edge.tangentX * tangentOffset + edge.normalX * outwardOffset,
    z: edge.z + edge.tangentZ * tangentOffset + edge.normalZ * outwardOffset
  };
}

function addFacadeBeam(addBox, material, edge, width, height, depth, y, tangentOffset = 0, outwardOffset = 0.08) {
  const point = facadePoint(edge, tangentOffset, outwardOffset);
  return addBox(material, width, height, depth, point.x, y, point.z, edge.yaw);
}

function addRailings(addBox, edge, center, width, baseY, height = 0.78) {
  const left = center - width * 0.5;
  const right = center + width * 0.5;
  for (const tangentOffset of [left, right]) {
    const p = facadePoint(edge, tangentOffset, 0.78);
    addBox('dark-metal', 0.055, height, 0.055, p.x, baseY + height * 0.5, p.z, edge.yaw);
  }
  addFacadeBeam(addBox, 'dark-metal', edge, width, 0.055, 0.055, baseY + height, center, 0.78);
}

function addEntryStep(addBox, edge, entrance, profile, mesh, counters) {
  if (!entrance) return;
  const tangentOffset = (entrance.x - edge.x) * edge.tangentX + (entrance.z - edge.z) * edge.tangentZ;
  const measuredRise = Math.max(0, finite(entrance.facadeBaseY) - finite(entrance.approachY, entrance.y));
  const isTownhouse = /rowhouse|townhouse|attached_brick/.test(profile.familyId);
  const targetRise = measuredRise >= 0.14 ? Math.min(0.85, measuredRise) : isTownhouse ? 0.14 : 0.09;
  const stepCount = Math.max(1, Math.min(5, Math.ceil(targetRise / 0.17)));
  const stepHeight = targetRise / stepCount;
  const width = Math.min(2.15, Math.max(1.3, finite(profile.door?.width, 1.3) + 0.35));
  const groundY = finite(entrance.approachY, entrance.y);
  for (let index = 0; index < stepCount; index += 1) {
    const height = stepHeight * (index + 1);
    const depth = 0.28 + (stepCount - index) * 0.16;
    const outward = depth * 0.5 + 0.035;
    const p = facadePoint(edge, tangentOffset, outward);
    addBox('trim', width, height, depth, p.x, groundY + height * 0.5, p.z, edge.yaw);
  }
  counters.modules.entry_step = (counters.modules.entry_step || 0) + 1;
  if (profile.details.includes('stoop_railing') && targetRise >= 0.3) {
    addRailings(addBox, edge, tangentOffset, width, groundY + targetRise);
    counters.modules.stoop_railing = (counters.modules.stoop_railing || 0) + 1;
  }
}

function addPorch(addBox, edge, entrance, profile, counters) {
  if (!entrance || !profile.details.includes('small_porch')) return;
  const tangentOffset = (entrance.x - edge.x) * edge.tangentX + (entrance.z - edge.z) * edge.tangentZ;
  const width = Math.min(3.4, Math.max(2.25, finite(profile.door?.width, 1.4) + 1.05));
  const groundY = finite(entrance.approachY, entrance.y);
  addFacadeBeam(addBox, 'trim', edge, width, 0.14, 1.15, groundY + 0.09, tangentOffset, 0.58);
  addFacadeBeam(addBox, 'trim', edge, width, 0.13, 1.28, groundY + 2.62, tangentOffset, 0.64);
  for (const side of [-1, 1]) {
    const p = facadePoint(edge, tangentOffset + side * (width * 0.44), 1.05);
    addBox('trim', 0.1, 2.42, 0.1, p.x, groundY + 1.31, p.z, edge.yaw);
  }
  counters.modules.small_porch = (counters.modules.small_porch || 0) + 1;
}

function addCornice(addBox, edge, topY, profile, counters) {
  const type = profile.details.includes('masonry_cornice') ? 'masonry_cornice' : profile.details.includes('modern_parapet') ? 'modern_parapet' : null;
  if (!type) return;
  const width = Math.max(2.2, edge.length - 0.18);
  const height = type === 'masonry_cornice' ? 0.34 : 0.22;
  const depth = type === 'masonry_cornice' ? 0.34 : 0.22;
  addFacadeBeam(addBox, 'trim', edge, width, height, depth, topY - height * 0.3, 0, depth * 0.42);
  if (type === 'masonry_cornice') {
    addFacadeBeam(addBox, 'trim', edge, width * 0.98, 0.1, depth + 0.12, topY + 0.08, 0, depth * 0.5);
  }
  counters.modules[type] = (counters.modules[type] || 0) + 1;
}

function addStorefrontAwning(addBox, edge, baseY, profile, seed, counters) {
  if (!profile.details.includes('storefront_awning') || profile.storefrontStyle === 'none' || edge.length < 3.2) return;
  const width = Math.min(8.5, Math.max(2.6, edge.length - 0.8));
  const material = ['awning-red', 'awning-blue', 'awning-ochre'][(seed >>> 5) % 3];
  addFacadeBeam(addBox, material, edge, width, 0.16, 0.95, baseY + 2.82, 0, 0.48);
  addFacadeBeam(addBox, 'dark-metal', edge, width + 0.08, 0.07, 0.07, baseY + 2.92, 0, 0.06);
  counters.modules.storefront_awning = (counters.modules.storefront_awning || 0) + 1;
}

function addBalconies(addBox, edge, baseY, topY, profile, seed, counters) {
  if (!profile.details.includes('balcony') || topY - baseY < 9.5 || edge.length < 4.2) return;
  const floorHeight = finite(profile.window?.floorHeight, 3.15);
  const count = Math.min(3, Math.max(1, Math.floor((topY - baseY - 4) / (floorHeight * 2))));
  const width = Math.min(4.2, Math.max(2.5, edge.length * 0.42));
  const tangentOffset = (((seed >>> 7) % 5) - 2) * Math.min(0.32, Math.max(0, edge.length - width) * 0.12);
  for (let index = 0; index < count; index += 1) {
    const y = Math.min(topY - 1.2, baseY + floorHeight * (2 + index * 2));
    addFacadeBeam(addBox, 'trim', edge, width, 0.12, 0.82, y, tangentOffset, 0.43);
    addRailings(addBox, edge, tangentOffset, width, y + 0.07, 0.72);
  }
  counters.modules.balcony = (counters.modules.balcony || 0) + 1;
}

function addFireEscape(addBox, edge, baseY, topY, profile, seed, counters) {
  if (!profile.details.includes('fire_escape') || topY - baseY < 11 || edge.length < 4) return;
  const width = Math.min(2.8, edge.length * 0.38);
  const tangentOffset = (seed & 1 ? -1 : 1) * Math.min(edge.length * 0.22, Math.max(0, (edge.length - width) * 0.42));
  const floors = Math.min(3, Math.max(1, Math.floor((topY - baseY - 5) / 3.1)));
  for (let index = 0; index < floors; index += 1) {
    const y = baseY + 4.7 + index * 3.1;
    addFacadeBeam(addBox, 'dark-metal', edge, width, 0.09, 0.72, y, tangentOffset, 0.39);
    addRailings(addBox, edge, tangentOffset, width, y + 0.04, 0.68);
  }
  counters.modules.fire_escape = (counters.modules.fire_escape || 0) + 1;
}

function addServiceFront(addBox, edge, baseY, profile, counters) {
  const garage = profile.details.includes('garage_surround');
  const loading = profile.details.includes('loading_canopy');
  if (!garage && !loading) return;
  const width = Math.min(edge.length - 0.5, garage ? 3.2 : 4.3);
  if (width < 2.4) return;
  const height = garage ? 2.7 : 3.15;
  addFacadeBeam(addBox, 'glass', edge, width, height, 0.065, baseY + height * 0.5 + 0.06, 0, 0.045);
  addFacadeBeam(addBox, 'dark-metal', edge, width + 0.22, 0.16, 0.14, baseY + height + 0.13, 0, 0.08);
  for (const side of [-1, 1]) {
    const point = facadePoint(edge, side * (width * 0.5 + 0.08), 0.08);
    addBox('dark-metal', 0.14, height + 0.12, 0.14, point.x, baseY + (height + 0.12) * 0.5, point.z, edge.yaw);
  }
  if (loading) addFacadeBeam(addBox, 'dark-metal', edge, width + 0.5, 0.13, 0.82, baseY + height + 0.42, 0, 0.42);
  const module = garage ? 'garage_surround' : 'loading_canopy';
  counters.modules[module] = (counters.modules[module] || 0) + 1;
}

function addChimney(addBox, mesh, profile, seed, counters) {
  if (!profile.details.includes('chimney')) return;
  const points = mesh.userData?.buildingFootprint || [];
  const center = footprintCenter(points);
  const topY = finite(mesh.position?.y) + finite(mesh.userData?.bodyHeightMeters, mesh.userData?.heightMeters);
  const offset = ((seed >>> 9) % 3 - 1) * 0.45;
  addBox('trim', 0.58, 1.25, 0.58, center.x + offset, topY + 0.62, center.z - offset, 0);
  counters.modules.chimney = (counters.modules.chimney || 0) + 1;
}

function distribution(values) {
  return Object.freeze(Object.fromEntries([...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))));
}

export function publishBuildingExteriorDetails(appCtx, options = {}) {
  const tier = tierForContext(appCtx, options.tier);
  const limit = DETAIL_LIMITS[tier];
  const radius = DETAIL_RADIUS[tier];
  const candidates = (Array.isArray(appCtx?.buildingMeshes) ? appCtx.buildingMeshes : [])
    .filter((mesh) =>
      mesh?.userData?.lodTier === 'near' &&
      mesh?.material?.userData?.buildingExterior === true &&
      mesh?.userData?.exteriorProfile &&
      !mesh?.userData?.isRoofDetail
    )
    .map((mesh) => {
      const center = footprintCenter(mesh.userData.buildingFootprint);
      return { mesh, distance: Math.hypot(center.x, center.z) };
    })
    .filter((candidate) => candidate.distance <= radius)
    .sort((a, b) => a.distance - b.distance || String(a.mesh.userData?.sourceBuildingId || '').localeCompare(String(b.mesh.userData?.sourceBuildingId || '')))
    .slice(0, limit);

  const materials = createDetailMaterials();
  const batches = createBatchMap(materials);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const counters = { boxes: 0, vertices: 0, modules: {} };
  const addBox = boxAppender(unitBox, batches, counters);
  const families = new Map();
  const materialVariants = new Map();
  const windows = new Map();
  const doors = new Map();
  const storefronts = new Map();
  const combinations = new Set();

  for (const { mesh } of candidates) {
    const profile = mesh.userData.exteriorProfile;
    const sourceBuildingId = String(mesh.userData?.sourceBuildingId || '');
    const entrance = appCtx?.buildingEntranceByBuilding?.get?.(sourceBuildingId) || null;
    const edge = facadeEdgeForMesh(appCtx, mesh, entrance);
    if (!edge) continue;
    const baseY = finite(mesh.position?.y);
    const topY = baseY + finite(mesh.userData?.bodyHeightMeters, mesh.userData?.heightMeters);
    const seed = finite(mesh.userData?.buildingSeed) >>> 0;
    families.set(profile.familyId, (families.get(profile.familyId) || 0) + 1);
    materialVariants.set(profile.materialId, (materialVariants.get(profile.materialId) || 0) + 1);
    windows.set(profile.windowStyle, (windows.get(profile.windowStyle) || 0) + 1);
    doors.set(profile.doorStyle, (doors.get(profile.doorStyle) || 0) + 1);
    storefronts.set(profile.storefrontStyle, (storefronts.get(profile.storefrontStyle) || 0) + 1);
    combinations.add([profile.familyId, profile.materialId, profile.windowStyle, profile.doorStyle, profile.storefrontStyle].join('|'));

    addCornice(addBox, edge, topY, profile, counters);
    addStorefrontAwning(addBox, edge, baseY, profile, seed, counters);
    addEntryStep(addBox, edge, entrance, profile, mesh, counters);
    addPorch(addBox, edge, entrance, profile, counters);
    addBalconies(addBox, edge, baseY, topY, profile, seed, counters);
    addFireEscape(addBox, edge, baseY, topY, profile, seed, counters);
    addServiceFront(addBox, edge, baseY, profile, counters);
    addChimney(addBox, mesh, profile, seed, counters);
  }
  unitBox.dispose();

  const meshes = [];
  let triangles = 0;
  for (const [materialKey, batch] of batches) {
    const geometry = buildMergedGeometry(batch);
    if (!geometry) continue;
    const material = materials.get(materialKey);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `building-exterior-details:${materialKey}`;
    mesh.castShadow = tier === 'quality' && materialKey !== 'glass';
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.userData = {
      buildingExteriorDetailBatch: true,
      materialKey,
      detailTier: tier,
      sourceClaim: 'generated-visual-representation'
    };
    triangles += Math.floor(Number(geometry.index?.count || 0) / 3);
    appCtx.addEarthWorldObject(mesh);
    appCtx.buildingExteriorDetailMeshes ||= [];
    appCtx.buildingExteriorDetailMeshes.push(mesh);
    meshes.push(mesh);
  }
  for (const [key, material] of materials) {
    if (!batches.get(key)?.positions.length) material.dispose();
  }

  const diagnostics = Object.freeze({
    type: 'BuildingExteriorDetailPublication',
    schemaVersion: 1,
    tier,
    radius,
    candidateLimit: limit,
    sourceBuildings: candidates.length,
    detailBatches: meshes.length,
    addedDrawCalls: meshes.length,
    boxes: counters.boxes,
    vertices: counters.vertices,
    triangles,
    combinations: combinations.size,
    modules: Object.freeze({ ...counters.modules }),
    families: distribution(families),
    materials: distribution(materialVariants),
    windows: distribution(windows),
    doors: distribution(doors),
    storefronts: distribution(storefronts),
    catalog: buildingExteriorCatalogSnapshot(),
    geometryAuthority: 'mapped-building-footprint-unchanged',
    entranceAuthority: 'building-facade-entrances',
    collisionAuthority: 'existing-building-collider-unchanged'
  });
  appCtx.buildingExteriorDetailPublication = diagnostics;
  return diagnostics;
}

export function clearBuildingExteriorDetails(appCtx) {
  const meshes = Array.isArray(appCtx?.buildingExteriorDetailMeshes)
    ? appCtx.buildingExteriorDetailMeshes
    : [];
  const disposedMaterials = new Set();
  for (const mesh of meshes) {
    mesh?.parent?.remove?.(mesh);
    mesh?.geometry?.dispose?.();
    if (mesh?.material && !disposedMaterials.has(mesh.material)) {
      disposedMaterials.add(mesh.material);
      mesh.material.dispose?.();
    }
  }
  appCtx.buildingExteriorDetailMeshes = [];
  appCtx.buildingExteriorDetailPublication = null;
}

export { DETAIL_LIMITS, DETAIL_RADIUS, facadeEdgeForMesh };
