import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildWorldVegetationInstancing,
  collectWorldVegetationPlacements
} from "./vegetation.js?v=3";
import {
  registerStreetLamp,
  resetStreetLampFixtures
} from "../engine/night-lighting.js?v=6";

let furnitureMaterialsReady = false;
let furnitureGeometriesReady = false;
let signTextureCache = new Map();
let signTextGeometry = null;

let matPole;
let matSignBg;
let matTreeShades;
let matTrunk;
let matLampHead;
let matTrashBody;
let matTrashLid;

let geoSignPole;
let geoSignBoard;
let geoTreeCanopy;
let geoTreeTrunk;
let geoLampPole;
let geoLampHead;
let geoTrashBody;
let geoTrashLid;

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
      maxTrashTotal: 18
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
      maxTrashTotal: 42
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
    maxTrashTotal: 26
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
  geoLampPole = new THREE.CylinderGeometry(0.12, 0.15, 6, 6);
  geoLampHead = new THREE.SphereGeometry(0.5, 8, 6);
  geoTrashBody = new THREE.CylinderGeometry(0.4, 0.35, 1.0, 8);
  geoTrashLid = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
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
  appCtx.scene.add(group);
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

function createLightPost(x, z) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(geoLampPole, matPole);
  pole.position.y = 3;
  group.add(pole);

  const head = new THREE.Mesh(geoLampHead, matLampHead);
  head.position.y = 6.2;
  group.add(head);

  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
  registerStreetLamp(group, head);
}

function createTrashCan(x, z) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(geoTrashBody, matTrashBody);
  body.position.y = 0.5;
  group.add(body);

  const lid = new THREE.Mesh(geoTrashLid, matTrashLid);
  lid.position.y = 1.05;
  group.add(lid);

  group.position.set(x, terrainHeightAt(x, z), z);
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
}

export function generateStreetFurniture() {
  initFurnitureMaterials();
  initFurnitureGeometries();
  resetStreetLampFixtures();

  const budget = getStreetFurnitureBudget();
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
        const offset = road.width / 2 + 2;
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

  buildWorldVegetationInstancing(collectWorldVegetationPlacements(), {
    initFurnitureMaterials,
    initFurnitureGeometries,
    getResources: () => ({
      geoTreeTrunk,
      geoTreeCanopy,
      matTrunk
    })
  });

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
        const offset = road.width / 2 + 1.5;
        createLightPost(p1.x + nx * offset, p1.z + nz * offset);
        totalLamps += 1;
      }
    }
  });

  let totalTrash = 0;
  appCtx.pois.forEach((poi, i) => {
    if (totalTrash >= budget.maxTrashTotal) return;
    if (i % budget.trashEveryNthPoi !== 0) return;
    const offset = 3 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    createTrashCan(poi.x + Math.cos(angle) * offset, poi.z + Math.sin(angle) * offset);
    totalTrash += 1;
  });
}

export function resetWorldFurnitureCaches() {
  signTextureCache.clear();
  signTextGeometry = null;
}
