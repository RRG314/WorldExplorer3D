import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildWorldVegetationInstancing,
  collectWorldVegetationPlacements
} from "./vegetation.js?v=1";

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

function terrainHeightAt(x, z) {
  return typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
}

function initFurnitureMaterials() {
  if (furnitureMaterialsReady) return;
  matPole = new THREE.MeshLambertMaterial({ color: 0x666666 });
  matSignBg = new THREE.MeshLambertMaterial({ color: 0x2a6e2a });
  matTreeShades = [
    new THREE.MeshLambertMaterial({ color: 0x1a5c1a }),
    new THREE.MeshLambertMaterial({ color: 0x2d7a2d }),
    new THREE.MeshLambertMaterial({ color: 0x3d8b3d }),
    new THREE.MeshLambertMaterial({ color: 0x4a9e3a }),
    new THREE.MeshLambertMaterial({ color: 0x2a6b3e }),
    new THREE.MeshLambertMaterial({ color: 0x1f6e2f })
  ];
  matTrunk = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
  matLampHead = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0xffffaa, emissiveIntensity: 0.5 });
  matTrashBody = new THREE.MeshLambertMaterial({ color: 0x3a5a3a });
  matTrashLid = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
  furnitureMaterialsReady = true;
}

function initFurnitureGeometries() {
  if (furnitureGeometriesReady) return;
  geoSignPole = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6);
  geoSignBoard = new THREE.BoxGeometry(4, 0.8, 0.1);
  geoTreeTrunk = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
  geoTreeCanopy = new THREE.SphereGeometry(3, 8, 6);
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

  const signSpacing = 120;
  const signedRoads = new Set();
  appCtx.roads.forEach((road) => {
    if (!road.name || road.name === road.type.charAt(0).toUpperCase() + road.type.slice(1)) return;
    if (signedRoads.has(road.name)) return;
    signedRoads.add(road.name);

    let distAccum = 0;
    let signsPlaced = 0;
    for (let i = 0; i < road.pts.length - 1 && signsPlaced < 2; i++) {
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

  const lampSpacing = 80;
  appCtx.roads.forEach((road) => {
    if (road.width < 12) return;
    let distAccum = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i];
      const p2 = road.pts[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      distAccum += segLen;

      if (distAccum >= lampSpacing) {
        distAccum = 0;
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const offset = road.width / 2 + 1.5;
        createLightPost(p1.x + nx * offset, p1.z + nz * offset);
      }
    }
  });

  appCtx.pois.forEach((poi, i) => {
    if (i % 5 !== 0) return;
    const offset = 3 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    createTrashCan(poi.x + Math.cos(angle) * offset, poi.z + Math.sin(angle) * offset);
  });
}

export function resetWorldFurnitureCaches() {
  signTextureCache.clear();
  signTextGeometry = null;
}
