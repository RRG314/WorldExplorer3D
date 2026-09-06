import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildWorldVegetationInstancing,
  collectWorldVegetationPlacements
} from "./vegetation.js?v=10";
import {
  registerStreetLamp,
  resetStreetLampFixtures
} from "../engine/night-lighting.js?v=8";
import { roadWidthAtSegment } from './road-cross-section-profile.js?v=1';

let furnitureMaterialsReady = false;
let furnitureGeometriesReady = false;
let signTextureCache = new Map();
let signTextGeometry = null;
let worldCoverVegetationTimer = null;

let matPole;
let matSignBg;
let matTreeShades;
let matTrunk;
let matLampHead;
let matTrashBody;
let matTrashLid;
let matSignalHousing;
let matSignalRed;
let matSignalAmber;
let matSignalGreen;
let matStopSign;

let geoSignPole;
let geoSignBoard;
let geoTreeCanopy;
let geoTreeTrunk;
let geoLampPole;
let geoLampHead;
let geoTrashBody;
let geoTrashLid;
let geoSignalHousing;
let geoSignalLens;
let geoStopSign;

function getStreetFurnitureBudget() {
  const tier = String(appCtx.getDynamicBudgetState?.().tier || 'balanced').toLowerCase();
  if (tier === 'performance') {
    return {
      signSpacing: 180,
      maxSignsPerRoad: 1,
      maxSignsTotal: 28,
      lampSpacing: 140,
      minLampRoadWidth: 7.5,
      maxLampsTotal: 72,
      trashEveryNthPoi: 12,
      maxTrashTotal: 18,
      maxTrafficControls: 16
    };
  }
  if (tier === 'quality') {
    return {
      signSpacing: 105,
      maxSignsPerRoad: 2,
      maxSignsTotal: 84,
      lampSpacing: 72,
      minLampRoadWidth: 4.8,
      maxLampsTotal: 180,
      trashEveryNthPoi: 4,
      maxTrashTotal: 42,
      maxTrafficControls: 46
    };
  }
  return {
    signSpacing: 120,
    maxSignsPerRoad: 2,
    maxSignsTotal: 56,
    lampSpacing: 96,
    minLampRoadWidth: 5.8,
    maxLampsTotal: 120,
    trashEveryNthPoi: 6,
    maxTrashTotal: 26,
    maxTrafficControls: 30
  };
}

function terrainHeightAt(x, z) {
  return typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
}

function initFurnitureMaterials() {
  if (furnitureMaterialsReady) return;
  matPole = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.82, metalness: 0.18 });
  matSignBg = new THREE.MeshStandardMaterial({ color: 0x2a6e2a, roughness: 0.88, metalness: 0.02 });
  matTreeShades = [
    new THREE.MeshStandardMaterial({ color: 0x1a5c1a, roughness: 0.94, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 0.94, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x3d8b3d, roughness: 0.94, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x4a9e3a, roughness: 0.94, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x2a6b3e, roughness: 0.94, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ color: 0x1f6e2f, roughness: 0.94, metalness: 0.0 })
  ];
  matTrunk = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.97, metalness: 0.0 });
  matLampHead = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.12, emissive: 0xffffaa, emissiveIntensity: 0.5 });
  appCtx.streetLampHeadMaterial = matLampHead;
  matTrashBody = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.9, metalness: 0.04 });
  matTrashLid = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.78, metalness: 0.08 });
  matSignalHousing = new THREE.MeshStandardMaterial({ color: 0x20282b, roughness: .72, metalness: .22 });
  matSignalRed = new THREE.MeshStandardMaterial({ color: 0xd62f2f, emissive: 0x8a1010, emissiveIntensity: .7, roughness: .42 });
  matSignalAmber = new THREE.MeshStandardMaterial({ color: 0x9d7221, emissive: 0x3b2600, emissiveIntensity: .22, roughness: .48 });
  matSignalGreen = new THREE.MeshStandardMaterial({ color: 0x286c47, emissive: 0x082d19, emissiveIntensity: .22, roughness: .48 });
  matStopSign = new THREE.MeshStandardMaterial({ color: 0xb5242d, roughness: .7, metalness: .04 });
  furnitureMaterialsReady = true;
}

function createOrganicTreeCanopyGeometry() {
  const geometry = new THREE.IcosahedronGeometry(2.9, 2);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const len = Math.max(1e-4, vertex.length());
    const nx = vertex.x / len;
    const ny = vertex.y / len;
    const nz = vertex.z / len;
    const ripple =
      1 +
      0.1 * Math.sin(nx * 3.6 + nz * 2.9) +
      0.08 * Math.cos(nx * 5.2 - ny * 2.4 + nz * 4.1) +
      0.06 * (ny > 0 ? 1 : -0.45);

    vertex.x *= ripple * 1.04;
    vertex.y *= ripple * (ny > 0 ? 1.18 : 0.9);
    vertex.z *= ripple;
    position.setXYZ(i, vertex.x, vertex.y + 0.45, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function initFurnitureGeometries() {
  if (furnitureGeometriesReady) return;
  geoSignPole = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6);
  geoSignBoard = new THREE.BoxGeometry(4, 0.8, 0.1);
  geoTreeTrunk = new THREE.CylinderGeometry(0.24, 0.42, 4.6, 7);
  geoTreeCanopy = createOrganicTreeCanopyGeometry();
  geoLampPole = new THREE.CylinderGeometry(0.12, 0.17, 7, 8);
  geoLampHead = new THREE.BoxGeometry(1.2, 0.22, 0.55);
  geoTrashBody = new THREE.CylinderGeometry(0.4, 0.35, 1.0, 8);
  geoTrashLid = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
  geoSignalHousing = new THREE.BoxGeometry(.52, 1.5, .42);
  geoSignalLens = new THREE.SphereGeometry(.16, 8, 6);
  geoStopSign = new THREE.CylinderGeometry(.58, .58, .08, 8);
  furnitureGeometriesReady = true;
}

function getSignMaterial(name) {
  if (signTextureCache.has(name)) return signTextureCache.get(name);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a6e2a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const displayName = name.length > 18 ? name.substring(0, 17) + '…' : name;
  ctx.fillText(displayName, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  signTextureCache.set(name, material);
  return material;
}

function createStreetSign(x, z, name, roadAngle) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(geoSignPole, matPole);
  pole.position.y = 1.75;
  group.add(pole);

  const board = new THREE.Mesh(geoSignBoard, matSignBg);
  board.position.y = 3.6;
  group.add(board);

  if (!signTextGeometry) signTextGeometry = new THREE.PlaneGeometry(4, 0.8);
  const textMaterial = getSignMaterial(name);
  const textPlane = new THREE.Mesh(signTextGeometry, textMaterial);
  textPlane.position.y = 3.6;
  textPlane.position.z = 0.06;
  group.add(textPlane);

  const textPlaneBack = new THREE.Mesh(signTextGeometry, textMaterial);
  textPlaneBack.position.y = 3.6;
  textPlaneBack.position.z = -0.06;
  textPlaneBack.rotation.y = Math.PI;
  group.add(textPlaneBack);

  group.position.set(x, terrainHeightAt(x, z), z);
  group.rotation.y = roadAngle;
  group.userData.furniturePos = { x, z };
  markFurniture(group, 'street_name_sign', 'road_name_inference');
  appCtx.addEarthWorldObject(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function roadLightingEligible(road, point) {
  const lit = String(road?.litTag || '').toLowerCase();
  if (lit === 'no' || lit === 'false' || lit === '0') return false;
  if (lit === 'yes' || lit === 'true' || lit === '1' || lit === 'automatic') return true;
  const type = String(road?.type || '').toLowerCase();
  if (/motorway|trunk|track/.test(type)) return false;
  if (!/primary|secondary|tertiary|residential|living_street|service|unclassified/.test(type)) return false;
  const nearby = appCtx.getNearbyBuildings?.(point.x, point.z, 85) || [];
  if (nearby.length >= 5) return true;
  let nearbyRoads = 0;
  for (const candidate of appCtx.roads || []) {
    const bounds = candidate?.bounds;
    if (!bounds) continue;
    if (
      point.x >= bounds.minX - 55 && point.x <= bounds.maxX + 55 &&
      point.z >= bounds.minZ - 55 && point.z <= bounds.maxZ + 55
    ) {
      nearbyRoads += 1;
      if (nearbyRoads >= 8) return true;
    }
  }
  return false;
}

function markFurniture(group, kind, provenance = 'inferred') {
  group.userData.furnitureKind = kind;
  group.userData.provenance = provenance;
  group.userData.condition = 1;
  group.userData.interactiveWorldObject = true;
  const identitySeed = `${kind}:${provenance}:${group.position.x.toFixed(1)}:${group.position.z.toFixed(1)}`;
  let hash = 2166136261;
  for (const char of identitySeed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  group.userData.urbanEntityId = `furniture:${kind}:${(hash >>> 0).toString(16)}`;
}

function createLightPost(x, z, provenance = 'inferred', roadTarget = null) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(geoLampPole, matPole);
  pole.position.y = 3.5;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.16, 0.16), matPole);
  arm.position.set(1.55, 6.92, 0);
  group.add(arm);

  const brace = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 0.1), matPole);
  brace.position.set(0.72, 6.48, 0);
  brace.rotation.z = 0.5;
  group.add(brace);

  const head = new THREE.Mesh(geoLampHead, matLampHead);
  head.position.set(3.1, 6.78, 0);
  head.rotation.z = -0.08;
  group.add(head);

  group.position.set(x, terrainHeightAt(x, z), z);
  const targetX = Number(roadTarget?.x);
  const targetZ = Number(roadTarget?.z);
  if (Number.isFinite(targetX) && Number.isFinite(targetZ)) {
    const dx = targetX - x;
    const dz = targetZ - z;
    if (Math.hypot(dx, dz) > 0.01) group.rotation.y = Math.atan2(-dz, dx);
  }
  group.userData.furniturePos = { x, z };
  markFurniture(group, 'street_lamp', provenance);
  appCtx.addEarthWorldObject(group);
  appCtx.streetFurnitureMeshes.push(group);
  registerStreetLamp(group, head, Number.isFinite(targetX) && Number.isFinite(targetZ)
    ? { x: targetX, z: targetZ }
    : { x: x + 3.1, z });
}

function createTrashCan(x, z, provenance = 'inferred') {
  const group = new THREE.Group();

  const body = new THREE.Mesh(geoTrashBody, matTrashBody);
  body.position.y = 0.5;
  group.add(body);

  const lid = new THREE.Mesh(geoTrashLid, matTrashLid);
  lid.position.y = 1.05;
  group.add(lid);

  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData.furniturePos = { x, z };
  markFurniture(group, 'waste_basket', provenance);
  appCtx.addEarthWorldObject(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function createTrafficSignal(x, z, yaw = 0, provenance = 'inferred', control = {}) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(geoLampPole, matPole);
  pole.scale.set(.8, .83, .8);
  pole.position.y = 2.5;
  group.add(pole);
  const housing = new THREE.Mesh(geoSignalHousing, matSignalHousing);
  housing.position.set(0, 4.85, 0);
  group.add(housing);
  const lenses = {};
  [
    { y: 5.32, material: matSignalRed },
    { y: 4.85, material: matSignalAmber },
    { y: 4.38, material: matSignalGreen }
  ].forEach((entry, index) => {
    const material = entry.material.clone();
    const aspect = ['red', 'amber', 'green'][index];
    const lens = new THREE.Mesh(geoSignalLens, material);
    lens.position.set(0, entry.y, .23);
    lens.scale.z = .45;
    lens.userData.signalAspect = aspect;
    lenses[aspect] = lens;
    group.add(lens);
  });
  group.position.set(x, terrainHeightAt(x, z), z);
  group.rotation.y = yaw;
  group.userData.furniturePos = { x, z };
  markFurniture(group, 'traffic_signal', provenance);
  group.userData.trafficControlId = String(control.id || '');
  group.userData.trafficControlCenter = { x: Number(control.x ?? x), z: Number(control.z ?? z) };
  group.userData.setTrafficSignalState = (activeAspect = 'red') => {
    const resolved = ['red', 'amber', 'green'].includes(activeAspect) ? activeAspect : 'red';
    Object.entries(lenses).forEach(([aspect, lens]) => {
      lens.material.emissiveIntensity = aspect === resolved ? 2.4 : .12;
    });
    group.userData.trafficSignalState = resolved;
  };
  group.userData.setTrafficSignalState('red');
  appCtx.addEarthWorldObject(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function createStopSign(x, z, yaw = 0, provenance = 'inferred') {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(geoSignPole, matPole);
  pole.scale.set(.72, .88, .72);
  pole.position.y = 1.55;
  group.add(pole);
  const sign = new THREE.Mesh(geoStopSign, matStopSign);
  sign.position.y = 3.05;
  sign.rotation.x = Math.PI * .5;
  group.add(sign);
  group.position.set(x, terrainHeightAt(x, z), z);
  group.rotation.y = yaw;
  group.userData.furniturePos = { x, z };
  markFurniture(group, 'stop_sign', provenance);
  appCtx.addEarthWorldObject(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function stableUnit(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function nearestRoadsidePoint(point) {
  let best = null;
  for (const road of appCtx.roads || []) {
    if (!Array.isArray(road?.pts) || /motorway|trunk|track/i.test(String(road.type || ''))) continue;
    for (let index = 0; index < road.pts.length - 1; index += 1) {
      const p1 = road.pts[index];
      const p2 = road.pts[index + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq <= .01) continue;
      const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.z - p1.z) * dz) / lengthSq));
      const x = p1.x + dx * t;
      const z = p1.z + dz * t;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (best && distance >= best.distance) continue;
      const length = Math.sqrt(lengthSq);
      const side = ((point.x - x) * (-dz / length) + (point.z - z) * (dx / length)) >= 0 ? 1 : -1;
      const offset = roadWidthAtSegment(road, index, t) * .5 + 1.35;
      best = {
        x: x + (-dz / length) * offset * side,
        z: z + (dx / length) * offset * side,
        centerX: x,
        centerZ: z,
        distance,
        yaw: Math.atan2(dx, dz),
        road,
        segmentIndex: index
      };
    }
  }
  return best && best.distance <= 42 ? best : null;
}

function trafficControlPlacements(mappedFurnitureNodes = [], roads = appCtx.roads || []) {
  const exact = [];
  const exactPositions = [];
  for (const node of mappedFurnitureNodes) {
    if (!Number.isFinite(node?.lat) || !Number.isFinite(node?.lon)) continue;
    const highway = String(node.tags?.highway || '').toLowerCase();
    const amenity = String(node.tags?.amenity || '').toLowerCase();
    const kind = highway === 'traffic_signals' ? 'traffic_signal'
      : highway === 'stop' || highway === 'give_way' ? 'stop_sign'
        : highway === 'street_lamp' ? 'street_lamp'
          : amenity === 'waste_basket' ? 'waste_basket' : '';
    if (!kind) continue;
    const position = appCtx.geoToWorld(node.lat, node.lon);
    exact.push({
      id: `mapped-control:${node.type || 'node'}:${node.id || `${node.lat}:${node.lon}`}`,
      kind,
      x: position.x,
      z: position.z,
      yaw: 0,
      provenance: 'mapped'
    });
    if (kind === 'traffic_signal' || kind === 'stop_sign') exactPositions.push(position);
  }
  const topology = new Map();
  for (const road of roads) {
    if (!road?.driveable || /motorway|trunk|track|service/i.test(String(road.type || ''))) continue;
    for (const node of road.sourceTopologyNodes || []) {
      const key = String(node.id || `${Math.round(node.x * 2)}:${Math.round(node.z * 2)}`);
      const record = topology.get(key) || { x: node.x, z: node.z, roads: [] };
      if (!record.roads.includes(road)) record.roads.push(road);
      topology.set(key, record);
    }
  }
  const inferred = [...topology.entries()].filter(([, entry]) => entry.roads.length >= 3).map(([key, entry]) => {
    const significant = entry.roads.filter((road) => /primary|secondary|tertiary/i.test(String(road.type || ''))).length;
    const first = entry.roads[0]?.pts || [];
    const p1 = first[0] || entry;
    const p2 = first[1] || entry;
    return {
      id: `inferred-control:${key}`,
      kind: significant >= 2 ? 'traffic_signal' : 'stop_sign',
      x: entry.x,
      z: entry.z,
      yaw: Math.atan2((p2.x || 0) - (p1.x || 0), (p2.z || 0) - (p1.z || 0)),
      provenance: 'intersection_inference'
    };
  }).filter((entry) => !exactPositions.some((point) => Math.hypot(point.x - entry.x, point.z - entry.z) < 12));
  return [...exact, ...inferred];
}

export function generateStreetFurniture(options = {}) {
  initFurnitureMaterials();
  initFurnitureGeometries();
  resetStreetLampFixtures();

  const budget = getStreetFurnitureBudget();
  const semanticPlacements = trafficControlPlacements(options.mappedFurnitureNodes);
  const orderedPlacements = [...semanticPlacements].sort((left, right) => {
    const leftControl = left.kind === 'traffic_signal' || left.kind === 'stop_sign';
    const rightControl = right.kind === 'traffic_signal' || right.kind === 'stop_sign';
    if (leftControl !== rightControl) return leftControl ? -1 : 1;
    return Math.hypot(left.x, left.z) - Math.hypot(right.x, right.z);
  });
  const publishedTrafficControls = [];
  let totalControls = 0;
  orderedPlacements.forEach((placement) => {
    if (placement.kind === 'street_lamp') {
      const roadside = nearestRoadsidePoint(placement);
      return createLightPost(placement.x, placement.z, placement.provenance, roadside
        ? { x: roadside.centerX, z: roadside.centerZ }
        : null);
    }
    if (placement.kind === 'waste_basket') return createTrashCan(placement.x, placement.z, placement.provenance);
    if (totalControls >= budget.maxTrafficControls) return;
    const roadside = nearestRoadsidePoint(placement);
    // OSM control nodes often sit on the road centerline because they describe
    // routing semantics. Never turn that logical point into a physical pole in
    // the travel lane. An unmatched control remains semantic-only.
    if (!roadside) {
      publishedTrafficControls.push(Object.freeze({
        ...placement,
        fixtureX: null,
        fixtureZ: null,
        fixtureYaw: null,
        placement: 'semantic-only'
      }));
      totalControls += 1;
      return;
    }
    const published = Object.freeze({
      ...placement,
      fixtureX: roadside.x,
      fixtureZ: roadside.z,
      fixtureYaw: roadside.yaw,
      placement: 'outside-road-envelope'
    });
    if (placement.kind === 'traffic_signal') createTrafficSignal(
      roadside.x,
      roadside.z,
      roadside.yaw,
      placement.provenance,
      published
    );
    else createStopSign(roadside.x, roadside.z, roadside.yaw, placement.provenance);
    publishedTrafficControls.push(published);
    totalControls += 1;
  });
  appCtx.trafficControlPlacements = Object.freeze(publishedTrafficControls);
  const signSpacing = budget.signSpacing;
  const signedRoads = new Set();
  let totalSigns = 0;
  appCtx.roads.forEach((road) => {
    if (totalSigns >= budget.maxSignsTotal) return;
    if (!road.name || road.name === road.type.charAt(0).toUpperCase() + road.type.slice(1)) return;
    if (signedRoads.has(road.name)) return;
    signedRoads.add(road.name);

    let distAccum = 0;
    let signsPlaced = 0;
    for (let i = 0; i < road.pts.length - 1 && signsPlaced < budget.maxSignsPerRoad; i++) {
      if (totalSigns >= budget.maxSignsTotal) break;
      const p1 = road.pts[i];
      const p2 = road.pts[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      distAccum += segLen;

      if (distAccum >= signSpacing) {
        distAccum = 0;
        signsPlaced += 1;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const angle = Math.atan2(dx, dz);
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const offset = roadWidthAtSegment(road, i, 0) / 2 + 2;
        createStreetSign(
          p1.x + nx * offset,
          p1.z + nz * offset,
          road.name,
          angle
        );
        totalSigns += 1;
      }
    }
  });

  refreshWorldCoverVegetation();

  const lampSpacing = budget.lampSpacing;
  let totalLamps = 0;
  appCtx.roads.forEach((road) => {
    if (totalLamps >= budget.maxLampsTotal) return;
    if (road.width < budget.minLampRoadWidth) return;
    let distAccum = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      if (totalLamps >= budget.maxLampsTotal) break;
      const p1 = road.pts[i];
      const p2 = road.pts[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      distAccum += segLen;

      if (distAccum >= lampSpacing) {
        if (!roadLightingEligible(road, p1)) continue;
        distAccum = 0;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const localWidth = roadWidthAtSegment(road, i, 0);
        if (localWidth < budget.minLampRoadWidth) continue;
        const offset = localWidth / 2 + 1.5;
        const lx = p1.x + nx * offset;
        const lz = p1.z + nz * offset;
        if (!semanticPlacements.some((placement) => placement.kind === 'street_lamp' && Math.hypot(placement.x - lx, placement.z - lz) < 18)) {
          createLightPost(lx, lz, 'inferred', { x: p1.x, z: p1.z });
        }
        totalLamps += 1;
      }
    }
  });

  let totalTrash = 0;
  appCtx.pois.forEach((poi, i) => {
    if (totalTrash >= budget.maxTrashTotal) return;
    if (i % budget.trashEveryNthPoi !== 0) return;
    const roadside = nearestRoadsidePoint(poi);
    const unit = stableUnit(`${poi.sourceFeatureId || poi.name}:${poi.x.toFixed(1)}:${poi.z.toFixed(1)}`);
    const offset = 3 + unit * 2;
    const angle = unit * Math.PI * 2;
    const position = roadside || { x: poi.x + Math.cos(angle) * offset, z: poi.z + Math.sin(angle) * offset };
    if (semanticPlacements.some((placement) => placement.kind === 'waste_basket' && Math.hypot(placement.x - position.x, placement.z - position.z) < 16)) return;
    createTrashCan(position.x, position.z);
    totalTrash += 1;
  });
}

export function refreshWorldCoverVegetation() {
  (appCtx.vegetationMeshes || []).forEach((mesh) => {
    mesh?.parent?.remove?.(mesh);
    if (Array.isArray(mesh?.material)) {
      mesh.material.forEach((material) => {
        if (material !== matTrunk) material?.dispose?.();
      });
    } else if (mesh?.material !== matTrunk) {
      mesh?.material?.dispose?.();
    }
  });
  appCtx.clearWorldCollections?.(['vegetationMeshes', 'vegetationFeatures']);
  return buildWorldVegetationInstancing(collectWorldVegetationPlacements(), {
    initFurnitureMaterials,
    initFurnitureGeometries,
    getResources: () => ({ geoTreeTrunk, geoTreeCanopy, matTrunk })
  });
}

export function scheduleWorldCoverVegetationRefresh() {
  if (worldCoverVegetationTimer) globalThis.clearTimeout(worldCoverVegetationTimer);
  const loadSequence = appCtx._worldLoadSequence;
  worldCoverVegetationTimer = globalThis.setTimeout(() => {
    worldCoverVegetationTimer = null;
    if (loadSequence !== appCtx._worldLoadSequence) return;
    refreshWorldCoverVegetation();
  }, 500);
}

export function flushWorldCoverVegetationRefresh() {
  if (!worldCoverVegetationTimer) return false;
  globalThis.clearTimeout(worldCoverVegetationTimer);
  worldCoverVegetationTimer = null;
  refreshWorldCoverVegetation();
  return true;
}

export function resetWorldFurnitureCaches() {
  if (worldCoverVegetationTimer) globalThis.clearTimeout(worldCoverVegetationTimer);
  worldCoverVegetationTimer = null;
  signTextureCache.forEach((material) => {
    material?.map?.dispose?.();
    material?.dispose?.();
  });
  signTextureCache.clear();
  signTextGeometry?.dispose?.();
  signTextGeometry = null;
}

Object.assign(appCtx, {
  flushWorldCoverVegetationRefresh,
  scheduleWorldCoverVegetationRefresh
});
