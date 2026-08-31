import { ctx as appCtx } from '../shared-context.js?v=55';
import { getPrimaryWorldCanvas } from '../engine/webgl-lifecycle.js?v=1';
import {
  getShipDeck,
  getShipDeckForRoom,
  SHIP_CREW_POSTS,
  SHIP_DECK_BOUNDS,
  SHIP_DECKS,
  SHIP_DOORS,
  SHIP_ROOMS,
  SHIP_STATIONS
} from './ship-layout.js?v=4';
import { deriveCrewOperations, summarizeCrewOperations } from './crew-operations.js?v=1';
import { shipAlertState } from './failure-authority.js?v=1';

let activeSession = null;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.58,
    metalness: options.metalness ?? 0.26,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0
  });
}

function box(group, size, position, surface, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), surface);
  mesh.position.set(position.x, position.y, position.z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function colliderForBox(x, z, width, depth, baseY = 0, height = 3.4, id = 'ship-wall') {
  return {
    minX: x - width * 0.5,
    maxX: x + width * 0.5,
    minZ: z - depth * 0.5,
    maxZ: z + depth * 0.5,
    baseY,
    height,
    centerX: x,
    centerZ: z,
    sourceBuildingId: id,
    buildingType: 'interior_wall',
    colliderDetail: 'full',
    isInteriorCollider: true
  };
}

function wall(group, colliders, start, end, surface, id) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const thickness = 0.28;
  const height = 3.35;
  const mesh = box(group, { x: thickness, y: height, z: length }, {
    x: (start.x + end.x) * 0.5,
    y: height * 0.5,
    z: (start.z + end.z) * 0.5
  }, surface, id);
  mesh.rotation.y = Math.atan2(dx, dz);
  const horizontal = Math.abs(dx) > Math.abs(dz);
  colliders.push(colliderForBox(
    (start.x + end.x) * 0.5,
    (start.z + end.z) * 0.5,
    horizontal ? length : thickness,
    horizontal ? thickness : length,
    0,
    height,
    id
  ));
}

function partitionWithDoor(group, colliders, x1, x2, z, doorX, surface, id) {
  const halfDoor = 1.05;
  if (doorX - halfDoor > x1) wall(group, colliders, { x: x1, z }, { x: doorX - halfDoor, z }, surface, `${id}:left`);
  if (doorX + halfDoor < x2) wall(group, colliders, { x: doorX + halfDoor, z }, { x: x2, z }, surface, `${id}:right`);
}

function sidePartitionWithDoor(group, colliders, x, z1, z2, doorZ, surface, id) {
  const halfDoor = 1.05;
  if (doorZ - halfDoor > z1) wall(group, colliders, { x, z: z1 }, { x, z: doorZ - halfDoor }, surface, `${id}:aft`);
  if (doorZ + halfDoor < z2) wall(group, colliders, { x, z: doorZ + halfDoor }, { x, z: z2 }, surface, `${id}:fore`);
}

function addConsole(group, x, z, yaw, accent, label) {
  const consoleGroup = new THREE.Group();
  consoleGroup.name = `ship-console:${label}`;
  const dark = material(0x111b28, { metalness: 0.62, roughness: 0.34 });
  const frame = material(0x566675, { metalness: 0.58, roughness: 0.38 });
  const screen = material(accent, { emissive: accent, emissiveIntensity: 1.05, metalness: 0.08, roughness: 0.3 });
  box(consoleGroup, { x: 2.55, y: 0.16, z: 0.92 }, { x: 0, y: 0.08, z: 0 }, frame, `${label}:console-plinth`);
  box(consoleGroup, { x: 2.3, y: 0.66, z: 0.72 }, { x: 0, y: 0.45, z: 0 }, dark, `${label}:console-body`);
  [-1.08, 1.08].forEach((side) => box(consoleGroup, { x: 0.18, y: 0.82, z: 0.82 }, { x: side, y: 0.48, z: 0 }, frame, `${label}:console-edge`));
  const display = box(consoleGroup, { x: 2.05, y: 0.55, z: 0.08 }, { x: 0, y: 1.02, z: -0.31 }, screen, `${label}:display`);
  display.rotation.x = -0.32;
  display.userData.shipAnimated = 'screen';
  display.userData.baseEmissiveIntensity = 0.9 + (accent % 7) * 0.025;
  for (let index = 0; index < 10; index += 1) {
    const buttonColor = index % 4 === 0 ? 0xe9a447 : index % 3 === 0 ? 0x72d6a2 : accent;
    box(consoleGroup, { x: 0.14, y: 0.035, z: 0.11 }, {
      x: -0.92 + (index % 5) * 0.46,
      y: 0.81,
      z: 0.02 + Math.floor(index / 5) * 0.2
    }, material(buttonColor, { emissive: buttonColor, emissiveIntensity: 0.55, metalness: 0.06, roughness: 0.36 }), `${label}:control`);
  }
  const seat = new THREE.Group();
  seat.name = `${label}:articulated-seat`;
  const fabric = material(0x26394c, { roughness: 0.82, metalness: 0.04 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.42, 12), frame);
  base.position.set(0, 0.21, 1.3);
  seat.add(base);
  box(seat, { x: 0.78, y: 0.18, z: 0.68 }, { x: 0, y: 0.58, z: 1.3 }, fabric, `${label}:seat-cushion`);
  const back = box(seat, { x: 0.78, y: 0.92, z: 0.18 }, { x: 0, y: 1.05, z: 1.58 }, fabric, `${label}:seat-back`);
  back.rotation.x = -0.12;
  [-0.48, 0.48].forEach((side) => {
    box(seat, { x: 0.1, y: 0.5, z: 0.1 }, { x: side, y: 0.65, z: 1.3 }, frame, `${label}:seat-arm`);
    box(seat, { x: 0.2, y: 0.08, z: 0.5 }, { x: side, y: 0.9, z: 1.12 }, frame, `${label}:seat-armrest`);
  });
  consoleGroup.add(seat);
  consoleGroup.position.set(x, 0, z);
  consoleGroup.rotation.y = yaw;
  group.add(consoleGroup);
  return consoleGroup;
}

function addScienceBench(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `science-bench:${label}`;
  const frame = material(0x566675, { metalness: 0.56, roughness: 0.4 });
  const worktop = material(0xbac4ca, { metalness: 0.14, roughness: 0.58 });
  const dark = material(0x162433, { metalness: 0.42, roughness: 0.48 });
  box(root, { x: 4.4, y: 0.18, z: 1.25 }, { x: 0, y: 1.02, z: 0 }, worktop, `${label}:worktop`);
  [-1.85, 0, 1.85].forEach((leg) => box(root, { x: 0.18, y: 1.02, z: 1.05 }, { x: leg, y: 0.51, z: 0 }, frame, `${label}:bench-frame`));
  box(root, { x: 4.25, y: 0.7, z: 0.32 }, { x: 0, y: 1.55, z: 0.45 }, dark, `${label}:instrument-shelf`);
  [-1.5, -0.75, 0, 0.75, 1.5].forEach((offset, index) => {
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.09 + (index % 2) * 0.025, 0.1, 0.32 + (index % 3) * 0.06, 10), material(index % 2 ? 0x79c7d9 : 0xd9b06f, { emissive: index % 2 ? 0x245b68 : 0x604a22, emissiveIntensity: 0.25, metalness: 0.08, roughness: 0.32 }));
    vessel.position.set(offset, 1.2, 0.05);
    root.add(vessel);
  });
  const display = box(root, { x: 1.15, y: 0.65, z: 0.08 }, { x: -1.4, y: 1.55, z: 0.25 }, material(accent, { emissive: accent, emissiveIntensity: 0.85, metalness: 0.04, roughness: 0.28 }), `${label}:instrument-display`);
  display.userData.shipAnimated = 'screen';
  display.userData.baseEmissiveIntensity = 0.78;
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addWallServicePanel(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `service-panel:${label}`;
  const frame = material(0x374b5b, { metalness: 0.58, roughness: 0.36 });
  const recess = material(0x0f1d28, { metalness: 0.5, roughness: 0.44 });
  box(root, { x: 1.5, y: 2.2, z: 0.14 }, { x: 0, y: 1.35, z: 0 }, frame, `${label}:service-frame`);
  box(root, { x: 1.24, y: 1.88, z: 0.08 }, { x: 0, y: 1.35, z: -0.09 }, recess, `${label}:service-recess`);
  [-0.42, 0, 0.42].forEach((offset, index) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.25, 10), material(index === 1 ? accent : 0x7b8790, { emissive: index === 1 ? accent : 0x000000, emissiveIntensity: index === 1 ? 0.35 : 0, metalness: 0.42, roughness: 0.38 }));
    tube.position.set(offset, 1.38, -0.18);
    root.add(tube);
  });
  for (let index = 0; index < 4; index += 1) box(root, { x: 0.16, y: 0.08, z: 0.05 }, { x: -0.46 + index * 0.31, y: 2.28, z: -0.18 }, material(index === 0 ? 0xe8a54a : accent, { emissive: index === 0 ? 0xe8a54a : accent, emissiveIntensity: 0.65 }), `${label}:service-status`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function cylinder(group, radiusTop, radiusBottom, height, position, surface, name = '', rotation = null, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), surface);
  mesh.position.set(position.x, position.y, position.z);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addMedicalBed(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `medical-bed:${label}`;
  const frame = material(0x667989, { metalness: 0.48, roughness: 0.38 });
  const cushion = material(0xd5e0e4, { metalness: 0.03, roughness: 0.86 });
  const screenSurface = material(accent, { emissive: accent, emissiveIntensity: 0.86, metalness: 0.04, roughness: 0.26 });
  box(root, { x: 2, y: 0.22, z: 3.35 }, { x: 0, y: 0.68, z: 0 }, frame, `${label}:bed-frame`);
  box(root, { x: 1.76, y: 0.22, z: 2.88 }, { x: 0, y: 0.87, z: 0.1 }, cushion, `${label}:mattress`);
  box(root, { x: 1.5, y: 0.2, z: 0.68 }, { x: 0, y: 1.02, z: -1.05 }, material(0xb8cbd4, { roughness: 0.9, metalness: 0 }), `${label}:pillow`);
  [-1.04, 1.04].forEach((side) => {
    box(root, { x: 0.08, y: 0.55, z: 2.6 }, { x: side, y: 1.1, z: 0.2 }, frame, `${label}:rail`);
    [-0.92, 0.92].forEach((end) => box(root, { x: 0.08, y: 0.56, z: 0.08 }, { x: side, y: 0.9, z: end }, frame, `${label}:rail-post`));
  });
  const display = box(root, { x: 0.82, y: 0.56, z: 0.08 }, { x: 1.32, y: 1.58, z: -0.95 }, screenSurface, `${label}:diagnostic-display`);
  display.userData.shipAnimated = 'screen';
  display.userData.baseEmissiveIntensity = 0.82;
  box(root, { x: 0.1, y: 1.1, z: 0.1 }, { x: 1.32, y: 1.12, z: -0.95 }, frame, `${label}:display-arm`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addBunkModule(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `crew-bunk:${label}`;
  const frame = material(0x4c6070, { metalness: 0.5, roughness: 0.42 });
  const fabric = material(0x8ea8b8, { metalness: 0.02, roughness: 0.88 });
  box(root, { x: 2.45, y: 2.75, z: 3.55 }, { x: 0, y: 1.38, z: 0 }, material(0x1b2a37, { metalness: 0.34, roughness: 0.56 }), `${label}:bunk-shell`);
  [0.64, 1.93].forEach((y, index) => {
    box(root, { x: 2.1, y: 0.18, z: 3.02 }, { x: 0, y, z: 0.05 }, fabric, `${label}:mattress-${index}`);
    box(root, { x: 1.7, y: 0.16, z: 0.62 }, { x: 0, y: y + 0.16, z: -1.02 }, material(0xc0cbd1, { roughness: 0.9, metalness: 0 }), `${label}:pillow-${index}`);
    box(root, { x: 0.12, y: 0.1, z: 0.55 }, { x: 0.82, y: y + 0.54, z: -1.3 }, material(accent, { emissive: accent, emissiveIntensity: 0.72 }), `${label}:reading-light-${index}`);
  });
  [-1.12, 1.12].forEach((side) => box(root, { x: 0.14, y: 2.75, z: 3.4 }, { x: side, y: 1.38, z: 0 }, frame, `${label}:bunk-frame`));
  box(root, { x: 2.1, y: 0.48, z: 3.02 }, { x: 0, y: 0.25, z: 0.05 }, frame, `${label}:personal-stowage`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addGalleyModule(group, x, z, yaw, accent) {
  const root = new THREE.Group();
  root.name = 'galley-service-module';
  const frame = material(0x526878, { metalness: 0.5, roughness: 0.38 });
  const counter = material(0xc5d0d4, { metalness: 0.18, roughness: 0.5 });
  const dark = material(0x142331, { metalness: 0.44, roughness: 0.44 });
  box(root, { x: 7.4, y: 0.94, z: 1.55 }, { x: 0, y: 0.47, z: 0 }, frame, 'galley-base');
  box(root, { x: 7.7, y: 0.16, z: 1.8 }, { x: 0, y: 1.02, z: 0 }, counter, 'galley-counter');
  [-2.55, -0.85, 0.85, 2.55].forEach((offset, index) => {
    box(root, { x: 1.45, y: 0.7, z: 0.08 }, { x: offset, y: 0.5, z: -0.79 }, dark, `galley-cabinet:${index}`);
    box(root, { x: 1.48, y: 0.56, z: 0.12 }, { x: offset, y: 1.72, z: 0.58 }, dark, `galley-appliance:${index}`);
    const panel = box(root, { x: 1.1, y: 0.28, z: 0.05 }, { x: offset, y: 1.72, z: 0.51 }, material(index === 1 ? 0xe2a34b : accent, { emissive: index === 1 ? 0xe2a34b : accent, emissiveIntensity: 0.6 }), `galley-display:${index}`);
    panel.userData.shipAnimated = 'screen';
    panel.userData.baseEmissiveIntensity = 0.56;
  });
  [0, 0.52, 1.04].forEach((offset) => cylinder(root, 0.11, 0.1, 0.28, { x: 2.25 + offset, y: 1.24, z: -0.15 }, material(0x96c3d0, { metalness: 0.06, roughness: 0.38 }), 'galley-container'));
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addLifeSupportRack(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `life-support:${label}`;
  const frame = material(0x4b6171, { metalness: 0.56, roughness: 0.36 });
  const dark = material(0x101e2a, { metalness: 0.48, roughness: 0.44 });
  box(root, { x: 3.7, y: 2.75, z: 1.15 }, { x: 0, y: 1.38, z: 0 }, frame, `${label}:rack-frame`);
  box(root, { x: 3.38, y: 2.42, z: 0.16 }, { x: 0, y: 1.38, z: -0.58 }, dark, `${label}:rack-recess`);
  [-1.1, 0, 1.1].forEach((offset, index) => {
    cylinder(root, 0.3, 0.3, 1.45, { x: offset, y: 1.3, z: -0.72 }, material(index === 1 ? 0x7ca6b5 : 0x81909a, { metalness: 0.46, roughness: 0.34 }), `${label}:canister`);
    cylinder(root, 0.07, 0.07, 1.85, { x: offset + 0.35, y: 1.45, z: -0.75 }, material(index === 0 ? accent : 0xa76e48, { emissive: index === 0 ? accent : 0x000000, emissiveIntensity: index === 0 ? 0.3 : 0, metalness: 0.52, roughness: 0.34 }), `${label}:pipe`);
  });
  for (let index = 0; index < 6; index += 1) box(root, { x: 0.19, y: 0.1, z: 0.06 }, { x: -1.28 + index * 0.5, y: 2.45, z: -0.7 }, material(index === 2 ? 0xe3a34b : accent, { emissive: index === 2 ? 0xe3a34b : accent, emissiveIntensity: 0.62 }), `${label}:status`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addHydroponicsRack(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `hydroponics:${label}`;
  const frame = material(0x526b65, { metalness: 0.36, roughness: 0.46 });
  const tray = material(0x273f3a, { metalness: 0.18, roughness: 0.7 });
  [-1.7, 1.7].forEach((side) => box(root, { x: 0.16, y: 2.7, z: 1.35 }, { x: side, y: 1.35, z: 0 }, frame, `${label}:rack-post`));
  [0.55, 1.35, 2.15].forEach((height, layer) => {
    box(root, { x: 3.55, y: 0.18, z: 1.45 }, { x: 0, y: height, z: 0 }, tray, `${label}:grow-tray`);
    box(root, { x: 3.25, y: 0.05, z: 0.22 }, { x: 0, y: height + 0.56, z: 0 }, material(accent, { emissive: accent, emissiveIntensity: 0.76, metalness: 0.04, roughness: 0.28 }), `${label}:grow-light`);
    [-1.25, -0.62, 0, 0.62, 1.25].forEach((offset, index) => {
      const plant = new THREE.Mesh(new THREE.SphereGeometry(0.15 + (index % 2) * 0.04, 8, 6), material(index % 3 === 0 ? 0x73ad5f : 0x4c8f58, { roughness: 0.94, metalness: 0 }));
      plant.scale.set(1.3, 0.72, 1);
      plant.position.set(offset, height + 0.28, (index % 2 ? 0.23 : -0.2));
      root.add(plant);
    });
  });
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addPowerCabinet(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `power-cabinet:${label}`;
  const frame = material(0x4a5966, { metalness: 0.66, roughness: 0.32 });
  const dark = material(0x111b24, { metalness: 0.54, roughness: 0.4 });
  box(root, { x: 2.2, y: 2.9, z: 1.2 }, { x: 0, y: 1.45, z: 0 }, frame, `${label}:cabinet`);
  box(root, { x: 1.86, y: 2.52, z: 0.14 }, { x: 0, y: 1.45, z: -0.63 }, dark, `${label}:cabinet-face`);
  [0.58, 1.16, 1.74, 2.32].forEach((height, row) => {
    box(root, { x: 1.55, y: 0.14, z: 0.08 }, { x: 0, y: height, z: -0.74 }, material(row === 2 ? 0xe1a247 : accent, { emissive: row === 2 ? 0xe1a247 : accent, emissiveIntensity: 0.64 }), `${label}:power-bus`);
    [-0.58, 0, 0.58].forEach((offset) => box(root, { x: 0.11, y: 0.1, z: 0.05 }, { x: offset, y: height + 0.22, z: -0.75 }, material(accent, { emissive: accent, emissiveIntensity: 0.7 }), `${label}:breaker-status`));
  });
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addThermalAssembly(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `thermal-assembly:${label}`;
  const frame = material(0x536a78, { metalness: 0.62, roughness: 0.34 });
  const copper = material(0xa66a45, { metalness: 0.62, roughness: 0.32 });
  box(root, { x: 4.5, y: 0.18, z: 1.7 }, { x: 0, y: 0.09, z: 0 }, frame, `${label}:thermal-plinth`);
  [-1.45, 0, 1.45].forEach((offset, index) => {
    cylinder(root, 0.56, 0.64, 1.25, { x: offset, y: 0.72, z: 0 }, frame, `${label}:pump`);
    cylinder(root, 0.18, 0.18, 2.15, { x: offset, y: 1.25, z: -0.42 }, index === 1 ? material(accent, { emissive: accent, emissiveIntensity: 0.28, metalness: 0.5, roughness: 0.32 }) : copper, `${label}:coolant-line`);
  });
  box(root, { x: 4.15, y: 0.18, z: 0.18 }, { x: 0, y: 2.24, z: -0.42 }, copper, `${label}:coolant-header`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addCargoModule(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `cargo-module:${label}`;
  const shell = material(0x6c6252, { metalness: 0.2, roughness: 0.74 });
  const frame = material(0x4d5e69, { metalness: 0.58, roughness: 0.36 });
  box(root, { x: 2.25, y: 1.65, z: 2.3 }, { x: 0, y: 0.83, z: 0 }, shell, `${label}:cargo-case`);
  [-1.08, 1.08].forEach((side) => box(root, { x: 0.14, y: 1.84, z: 2.48 }, { x: side, y: 0.92, z: 0 }, frame, `${label}:cargo-frame`));
  [-0.72, 0, 0.72].forEach((height) => box(root, { x: 1.65, y: 0.1, z: 0.08 }, { x: 0, y: 0.88 + height, z: -1.19 }, material(height === 0 ? accent : 0xc5a35c, { emissive: height === 0 ? accent : 0x000000, emissiveIntensity: height === 0 ? 0.5 : 0 }), `${label}:cargo-mark`));
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addEvaSuit(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `eva-suit:${label}`;
  const suit = material(0xd3d7d4, { metalness: 0.08, roughness: 0.68 });
  const frame = material(0x4d6170, { metalness: 0.58, roughness: 0.36 });
  box(root, { x: 1.35, y: 2.9, z: 0.65 }, { x: 0, y: 1.45, z: 0.35 }, frame, `${label}:suit-locker`);
  box(root, { x: 0.92, y: 1.05, z: 0.55 }, { x: 0, y: 1.38, z: -0.08 }, suit, `${label}:suit-torso`);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), material(0x93b8c6, { emissive: 0x183642, emissiveIntensity: 0.24, metalness: 0.12, roughness: 0.22 }));
  helmet.scale.set(1, 0.88, 0.82);
  helmet.position.set(0, 2.18, -0.1);
  root.add(helmet);
  [-0.34, 0.34].forEach((side) => {
    box(root, { x: 0.28, y: 0.9, z: 0.34 }, { x: side, y: 0.48, z: -0.04 }, suit, `${label}:suit-leg`);
    box(root, { x: 0.22, y: 0.82, z: 0.28 }, { x: side * 1.45, y: 1.45, z: -0.02 }, suit, `${label}:suit-arm`);
  });
  box(root, { x: 0.58, y: 0.18, z: 0.06 }, { x: 0, y: 1.38, z: -0.39 }, material(accent, { emissive: accent, emissiveIntensity: 0.64 }), `${label}:suit-control`);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addCrewMember(group, post, crew) {
  const root = new THREE.Group();
  root.name = `ship-crew:${crew?.id || post.crewId}`;
  root.userData.crewId = crew?.id || post.crewId;
  root.userData.crewName = crew?.name || 'Surveyor crew';
  root.userData.currentRoomId = post.roomId;
  root.userData.deckId = post.deckId;
  root.userData.route = [];
  root.userData.assignmentId = null;
  const uniform = material(crew?.id === 'crew-eng' ? 0xb5652a : crew?.id === 'crew-med' ? 0x5e789d : 0x253d66, { roughness: 0.72 });
  const skin = material(0xb88264, { roughness: 0.84, metalness: 0 });
  const trim = material(0xc8d4e4, { roughness: 0.58, metalness: 0.18 });
  box(root, { x: 0.72, y: 1.05, z: 0.42 }, { x: 0, y: 1.12, z: 0 }, uniform);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), skin);
  head.position.y = 1.84;
  root.add(head);
  [-0.22, 0.22].forEach((x) => box(root, { x: 0.18, y: 0.78, z: 0.2 }, { x, y: 0.39, z: 0 }, uniform));
  box(root, { x: 0.5, y: 0.08, z: 0.05 }, { x: 0, y: 1.35, z: -0.235 }, trim);
  root.position.set(post.x, 0.05, post.z);
  root.rotation.y = post.yaw;
  group.add(root);
  return root;
}

function postForCrewMember(crew, index = 0) {
  const roles = crew?.roles || [];
  if (roles.includes('engineering')) return { crewId: crew.id, deckId: 'engineering', roomId: 'engineering', x: -4.2 + (index % 3) * 2.2, z: 27.2, yaw: 0 };
  if (roles.includes('medical')) return { crewId: crew.id, deckId: 'habitat', roomId: 'medical', x: -5.5 - (index % 3) * 1.5, z: 19, yaw: Math.PI / 2 };
  if (roles.includes('life-support')) return { crewId: crew.id, deckId: 'habitat', roomId: 'life-support', x: 7.5, z: -11 - (index % 3) * 2, yaw: -Math.PI / 2 };
  if (roles.includes('science') || roles.includes('education')) return { crewId: crew.id, deckId: 'command', roomId: 'science', x: -7.2, z: -1 + (index % 3) * 2, yaw: Math.PI / 2 };
  return { crewId: crew.id, deckId: 'command', roomId: 'bridge', x: -4 + (index % 4) * 2.5, z: 29.5, yaw: Math.PI };
}

function disposeObject(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((entry) => entry?.dispose?.());
    else child.material?.dispose?.();
  });
}

function syncCrewMeshes(session, expedition) {
  const desired = (expedition?.crew || []).filter((crew) => crew.id !== 'player' && crew.status !== 'dead');
  const desiredIds = new Set(desired.map((crew) => crew.id));
  session.sceneState.crewMeshes = session.sceneState.crewMeshes.filter((mesh) => {
    if (desiredIds.has(mesh.userData.crewId)) return true;
    mesh.parent?.remove?.(mesh);
    disposeObject(mesh);
    return false;
  });
  const existing = new Set(session.sceneState.crewMeshes.map((mesh) => mesh.userData.crewId));
  desired.forEach((crew, index) => {
    if (existing.has(crew.id)) return;
    const mesh = addCrewMember(session.sceneState.crewLayer, postForCrewMember(crew, index), crew);
    mesh.visible = mesh.userData.deckId === session.activeDeckId;
    session.sceneState.crewMeshes.push(mesh);
  });
}

const ROOM_DOORS = Object.freeze(Object.fromEntries(SHIP_DOORS.map((door) => [door.roomId, Object.freeze({ x: door.x, z: door.z })])));

const ASSIGNMENT_TARGETS = Object.freeze({
  'navigation-watch': Object.freeze({ x: -4.5, z: 29.5 }),
  'flight-watch': Object.freeze({ x: 4.5, z: 29.5 }),
  'engineering-watch': Object.freeze({ x: -7, z: 30 }),
  'life-support-watch': Object.freeze({ x: 4.8, z: -14.5 }),
  'medical-watch': Object.freeze({ x: -4.5, z: 18 }),
  'science-watch': Object.freeze({ x: -5.1, z: 3 }),
  'systems-watch': Object.freeze({ x: -5.1, z: 3 }),
  'systems-round': Object.freeze({ x: 4.8, z: -14.5 }),
  'stores-round': Object.freeze({ x: -4.3, z: 0 }),
  'science-support': Object.freeze({ x: -5.1, z: 0 }),
  'thermal-response': Object.freeze({ x: 7, z: 30 }),
  'maintenance-support': Object.freeze({ x: 4.3, z: -14.5 }),
  'discovery-response': Object.freeze({ x: -5.1, z: 0 })
});

function targetForOperation(operation, crewIndex) {
  if (operation.assignmentId === 'crew-rest') {
    return { x: -9.5 + (crewIndex % 3) * 2.6, z: -3.2 + (crewIndex % 2) * 5.2 };
  }
  return ASSIGNMENT_TARGETS[operation.assignmentId] || ROOM_DOORS[operation.roomId] || { x: 0, z: 0 };
}

function buildCrewRoute(mesh, targetRoomId, target) {
  const currentRoomId = mesh.userData.currentRoomId;
  if (currentRoomId === targetRoomId) return [{ ...target, roomId: targetRoomId, final: true }];
  const fromDoor = ROOM_DOORS[currentRoomId];
  const toDoor = ROOM_DOORS[targetRoomId];
  if (!fromDoor || !toDoor) return [{ ...target, roomId: targetRoomId, final: true }];
  const route = [
    { ...fromDoor },
    { x: 0, z: fromDoor.z },
    { x: 0, z: toDoor.z },
    { ...toDoor },
    { ...target, roomId: targetRoomId, final: true }
  ];
  return route.filter((waypoint, index) => index === 0 || Math.hypot(
    waypoint.x - route[index - 1].x,
    waypoint.z - route[index - 1].z
  ) > 0.05);
}

function refreshCrewOperations(session, force = false) {
  if (!session?.sceneState) return;
  const operations = deriveCrewOperations(session.expedition);
  const byCrew = new Map(operations.map((operation) => [operation.crewId, operation]));
  session.sceneState.crewMeshes.forEach((mesh, index) => {
    const operation = byCrew.get(mesh.userData.crewId);
    if (!operation) return;
    const operationDeckId = getShipDeckForRoom(operation.roomId) || mesh.userData.deckId || 'command';
    if (mesh.userData.deckId !== operationDeckId) {
      mesh.userData.deckId = operationDeckId;
      mesh.userData.currentRoomId = operation.roomId;
      mesh.position.set(0, 0.05, 0);
      force = true;
    }
    mesh.visible = operationDeckId === session.activeDeckId;
    if (force || mesh.userData.assignmentId !== operation.assignmentId || mesh.userData.operationStatus !== operation.status) {
      const target = targetForOperation(operation, index);
      mesh.userData.route = buildCrewRoute(mesh, operation.roomId, target);
      mesh.userData.assignmentId = operation.assignmentId;
      mesh.userData.operationStatus = operation.status;
      mesh.userData.operationTask = operation.task;
    }
  });
  session.operations = operations;
  session.operationSummary = summarizeCrewOperations(operations);
}

function updateCrewMotion(session, dt) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  session.visualClock += step;
  session.operationRefreshElapsed += step;
  if (session.operationRefreshElapsed >= 1) {
    session.operationRefreshElapsed = 0;
    refreshCrewOperations(session);
  }
  session.sceneState.crewMeshes.forEach((mesh, index) => {
    const waypoint = mesh.userData.route?.[0];
    if (!waypoint) {
      mesh.position.y = 0.05 + Math.sin(session.visualClock * 1.8 + index) * 0.012;
      return;
    }
    const dx = waypoint.x - mesh.position.x;
    const dz = waypoint.z - mesh.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.07) {
      mesh.position.set(waypoint.x, 0.05, waypoint.z);
      mesh.userData.route.shift();
      if (waypoint.final) mesh.userData.currentRoomId = waypoint.roomId;
      return;
    }
    const travel = Math.min(distance, step * 1.25);
    mesh.position.x += dx / distance * travel;
    mesh.position.z += dz / distance * travel;
    mesh.position.y = 0.05 + Math.sin(session.visualClock * 7 + index) * 0.025;
    mesh.rotation.y = Math.atan2(dx, dz);
  });
}

function addDeckDetails(group, deckId) {
  const steel = material(0x65788b, { metalness: 0.5, roughness: 0.36 });
  const dark = material(0x172332, { metalness: 0.62, roughness: 0.34 });
  const soft = material(0xaebbc9, { roughness: 0.78, metalness: 0.08 });
  const green = material(0x2f8b5d, { emissive: 0x123d28, emissiveIntensity: 0.45, roughness: 0.82, metalness: 0 });
  const cargo = material(0x75614b, { roughness: 0.88, metalness: 0.1 });
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.1, 28), material(0x3b8fb8, { emissive: 0x1d526d, emissiveIntensity: 0.8 }));
  lift.position.set(0, 0.05, 0);
  lift.name = `deck-lift:${deckId}`;
  group.add(lift);

  if (deckId === 'command') {
    addConsole(group, -4.5, 32.1, Math.PI, 0x3aa8d8, 'navigation');
    addConsole(group, 4.5, 32.1, Math.PI, 0x5ed69d, 'flight');
    addConsole(group, 0, 27.2, 0, 0xe7a648, 'captain-log');
    addConsole(group, -8.2, 15.5, Math.PI / 2, 0x58b6e6, 'cartography');
    addConsole(group, 8.2, 15.5, -Math.PI / 2, 0x7399e8, 'communications');
    addConsole(group, -8.2, 0.5, Math.PI / 2, 0x5ed69d, 'physical-science');
    addConsole(group, 8.2, 0.5, -Math.PI / 2, 0x3aa8d8, 'sensors');
    addConsole(group, -8.2, -14.5, Math.PI / 2, 0xb887e8, 'analysis');
    addScienceBench(group, -8.1, -3.3, Math.PI / 2, 0x5ed69d, 'sample-analysis');
    addScienceBench(group, -8.1, -18.2, Math.PI / 2, 0xb887e8, 'data-instruments');
    addWallServicePanel(group, 12.62, 17.9, -Math.PI / 2, 0x7399e8, 'communications-service');
    addWallServicePanel(group, 12.62, 3.7, -Math.PI / 2, 0x3aa8d8, 'sensor-service');
    const briefing = new THREE.Group();
    briefing.name = 'briefing-furniture';
    box(briefing, { x: 5.6, y: 0.18, z: 2.3 }, { x: 0, y: 0.92, z: 0 }, dark, 'briefing-tabletop');
    [-2.2, 2.2].forEach((x) => box(briefing, { x: 0.24, y: 0.86, z: 1.6 }, { x, y: 0.43, z: 0 }, steel, 'briefing-table-leg'));
    [-2.05, -0.7, 0.7, 2.05].forEach((x, index) => {
      box(briefing, { x: 0.82, y: 0.15, z: 0.65 }, { x, y: 0.55, z: index % 2 ? -1.65 : 1.65 }, soft, 'briefing-seat');
      box(briefing, { x: 0.82, y: 0.72, z: 0.14 }, { x, y: 0.91, z: index % 2 ? -1.96 : 1.96 }, soft, 'briefing-seat-back');
    });
    briefing.position.set(7.8, 0, -14.5);
    group.add(briefing);
    [-3.6, -1.2, 1.2, 3.6].forEach((x) => {
      box(group, { x: 2.05, y: 0.2, z: 0.82 }, { x, y: 0.48, z: -31 }, soft, 'observation-seat');
      box(group, { x: 2.05, y: 0.72, z: 0.16 }, { x, y: 0.86, z: -31.35 }, soft, 'observation-seat-back');
    });
    addBridgeView(group);
  } else if (deckId === 'habitat') {
    addGalleyModule(group, -7.6, 26.1, 0, 0x5fd6a3);
    box(group, { x: 7.2, y: 0.18, z: 2.6 }, { x: 1.5, y: 0.92, z: 30.2 }, dark, 'wardroom-tabletop');
    [-1.2, 4.2].forEach((x) => box(group, { x: 0.22, y: 0.86, z: 1.8 }, { x, y: 0.43, z: 30.2 }, steel, 'wardroom-table-leg'));
    [-2.6, 0.15, 2.85, 5.55].forEach((x, index) => {
      const seatZ = index % 2 ? 28.35 : 32.05;
      box(group, { x: 1.05, y: 0.18, z: 0.78 }, { x, y: 0.55, z: seatZ }, soft, 'wardroom-seat');
      box(group, { x: 1.05, y: 0.7, z: 0.14 }, { x, y: 0.9, z: seatZ + (seatZ < 30 ? -0.38 : 0.38) }, soft, 'wardroom-seat-back');
    });
    [11.2, 15.4, 19.6].forEach((z, index) => addMedicalBed(group, -8.2, z, 0, index === 1 ? 0x7fd9c3 : 0x66add4, `medical-${index + 1}`));
    addWallServicePanel(group, -12.55, 18.8, Math.PI / 2, 0x66add4, 'medical-gases');
    box(group, { x: 1.8, y: 0.25, z: 4.9 }, { x: 6.8, y: 0.14, z: 15.5 }, dark, 'exercise-treadmill-bed');
    box(group, { x: 1.45, y: 0.08, z: 3.7 }, { x: 6.8, y: 0.31, z: 15.3 }, material(0x6b7d85, { roughness: 0.84, metalness: 0.08 }), 'exercise-treadmill-belt');
    box(group, { x: 1.7, y: 1.15, z: 0.14 }, { x: 6.8, y: 1.05, z: 13.38 }, steel, 'exercise-treadmill-console');
    box(group, { x: 2.7, y: 2.5, z: 0.55 }, { x: 10.2, y: 1.25, z: 18 }, steel, 'exercise-resistance-frame');
    [-1.1, 1.1].forEach((side) => cylinder(group, 0.22, 0.22, 1.2, { x: 10.2 + side, y: 1.72, z: 17.65 }, dark, 'exercise-flywheel', { x: Math.PI / 2, y: 0, z: 0 }, 14));
    addBunkModule(group, -8.5, -3.15, 0, 0x67c8a0, 'port-a');
    addBunkModule(group, -8.5, 3.15, Math.PI, 0x67c8a0, 'port-b');
    addBunkModule(group, 8.5, -3.15, 0, 0x67c8a0, 'starboard-a');
    addBunkModule(group, 8.5, 3.15, Math.PI, 0x67c8a0, 'starboard-b');
    addLifeSupportRack(group, -8.2, -11.2, 0, 0x65c8b1, 'water-recovery-a');
    addLifeSupportRack(group, -8.2, -17.7, Math.PI, 0x65c8b1, 'water-recovery-b');
    addLifeSupportRack(group, 8.2, -11.2, 0, 0x5fd6a3, 'atmosphere-a');
    addLifeSupportRack(group, 8.2, -17.7, Math.PI, 0x5fd6a3, 'atmosphere-b');
    [-33, -29, -25].forEach((z, index) => addHydroponicsRack(group, -8.2, z, index % 2 ? Math.PI : 0, 0x72dba4, `crop-${index + 1}`));
    [-32.2, -28, -24.8].forEach((z, index) => addCargoModule(group, 8.3, z, index % 2 ? Math.PI : 0, 0xe3a247, `shelter-${index + 1}`));
    box(group, { x: 7.5, y: 0.2, z: 1.35 }, { x: 8.1, y: 0.46, z: -29 }, soft, 'storm-shelter-bench');
    box(group, { x: 7.5, y: 0.68, z: 0.16 }, { x: 8.1, y: 0.84, z: -29.62 }, soft, 'storm-shelter-back');
  } else {
    const coreRoot = new THREE.Group();
    coreRoot.name = 'propulsion-core';
    const coreShell = cylinder(coreRoot, 1.18, 1.42, 5.6, { x: 0, y: 0, z: 0 }, material(0x573a34, { emissive: 0x33150d, emissiveIntensity: 0.42, metalness: 0.7, roughness: 0.26 }), 'propulsion-core-shell', { x: Math.PI / 2, y: 0, z: 0 }, 24);
    const coreEmitter = cylinder(coreRoot, 0.68, 0.68, 5.92, { x: 0, y: 0, z: 0 }, material(0xff9a59, { emissive: 0xff6d34, emissiveIntensity: 1.18, metalness: 0.12, roughness: 0.22 }), 'propulsion-core-emitter', { x: Math.PI / 2, y: 0, z: 0 }, 20);
    coreEmitter.userData.shipAnimated = 'screen';
    coreEmitter.userData.baseEmissiveIntensity = 1.12;
    [-2.25, 0, 2.25].forEach((z, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.16, 10, 28), material(index === 1 ? 0xe8b16a : 0x7f8d94, { emissive: index === 1 ? 0x8a451c : 0x1a2327, emissiveIntensity: index === 1 ? 0.72 : 0.18, metalness: 0.72, roughness: 0.26 }));
      ring.position.z = z;
      ring.name = `propulsion-core-field-ring:${index}`;
      coreRoot.add(ring);
    });
    [-1.85, 1.85].forEach((x) => {
      [-2.2, 2.2].forEach((z) => box(coreRoot, { x: 0.28, y: 2.5, z: 0.34 }, { x, y: -0.55, z }, steel, 'propulsion-core-support'));
    });
    [-2.2, 2.2].forEach((z) => box(coreRoot, { x: 3.95, y: 0.22, z: 0.34 }, { x: 0, y: -1.75, z }, steel, 'propulsion-core-crossbrace'));
    coreRoot.position.set(0, 1.82, 30.5);
    group.add(coreRoot);
    addConsole(group, -4.5, 31.2, Math.PI, 0xe28d4c, 'propulsion-control');
    addConsole(group, 4.5, 31.2, Math.PI, 0xe2b34c, 'engineering-watch');
    [-9.7, -6.9].forEach((x, index) => addPowerCabinet(group, x, 15.5, Math.PI / 2, 0xe2b34c, `power-${index + 1}`));
    addWallServicePanel(group, -12.55, 19, Math.PI / 2, 0xe2b34c, 'power-bus-service');
    addThermalAssembly(group, 8.2, 12.4, 0, 0x55b9d7, 'coolant-a');
    addThermalAssembly(group, 8.2, 18.7, Math.PI, 0x55b9d7, 'coolant-b');
    addConsole(group, -8, 0.5, Math.PI / 2, 0xdfa14a, 'fabricator');
    box(group, { x: 4.4, y: 0.18, z: 1.45 }, { x: -8.2, y: 0.92, z: -3.7 }, steel, 'fabrication-workbench');
    [-9.8, -8.2, -6.6].forEach((x, index) => cylinder(group, 0.2, 0.24, 0.62, { x, y: 1.32, z: -3.7 }, material(index === 1 ? 0xdfa14a : 0x81919a, { emissive: index === 1 ? 0x6d3c13 : 0x000000, emissiveIntensity: index === 1 ? 0.3 : 0 }), 'fabrication-feedstock'));
    [-3.6, 0, 3.6].forEach((z, index) => addCargoModule(group, 8.2, z, index % 2 ? Math.PI : 0, 0xdfa14a, `cargo-${index + 1}`));
    const processorRoot = new THREE.Group();
    processorRoot.name = 'resource-processor';
    cylinder(processorRoot, 1.25, 1.45, 2.6, { x: 0, y: 1.3, z: 0 }, steel, 'processor-vessel', null, 18);
    cylinder(processorRoot, 0.52, 0.72, 0.85, { x: 0, y: 3, z: 0 }, dark, 'processor-hopper', null, 16);
    [-1.35, 1.35].forEach((side) => cylinder(processorRoot, 0.12, 0.12, 2.1, { x: side, y: 1.45, z: 0 }, material(0xb46d45, { metalness: 0.58, roughness: 0.34 }), 'processor-pipe'));
    const processDisplay = box(processorRoot, { x: 0.9, y: 0.58, z: 0.08 }, { x: 0, y: 1.6, z: -1.35 }, material(0xdfa14a, { emissive: 0xdfa14a, emissiveIntensity: 0.8 }), 'processor-display');
    processDisplay.userData.shipAnimated = 'screen';
    processDisplay.userData.baseEmissiveIntensity = 0.76;
    processorRoot.position.set(-8.3, 0, -14.5);
    group.add(processorRoot);
    addEvaSuit(group, 6.2, -14.5, 0, 0xdfa14a, 'eva-one');
    addEvaSuit(group, 8.2, -14.5, 0, 0xdfa14a, 'eva-two');
    addEvaSuit(group, 10.2, -14.5, 0, 0xdfa14a, 'eva-three');
    const shuttle = new THREE.Group();
    shuttle.name = 'local-survey-craft';
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.65, 7.2, 22), steel);
    hull.rotation.x = Math.PI / 2;
    shuttle.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 22), steel);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 4.7;
    shuttle.add(nose);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), material(0x284e62, { emissive: 0x102b38, emissiveIntensity: 0.34, metalness: 0.12, roughness: 0.18 }));
    canopy.scale.set(0.88, 0.7, 1.45);
    canopy.position.set(0, 1.05, 1.1);
    shuttle.add(canopy);
    box(shuttle, { x: 7.4, y: 0.16, z: 2.15 }, { x: 0, y: -0.15, z: -0.4 }, steel, 'survey-craft-wing');
    [-3.2, 3.2].forEach((side) => cylinder(shuttle, 0.44, 0.62, 2.8, { x: side, y: -0.12, z: -0.4 }, dark, 'survey-craft-thruster', { x: Math.PI / 2, y: 0, z: 0 }, 16));
    [-0.56, 0.56].forEach((side) => box(shuttle, { x: 0.12, y: 0.12, z: 2.1 }, { x: side, y: 0.55, z: -3.5 }, material(0xdfa14a, { emissive: 0xdfa14a, emissiveIntensity: 0.62 }), 'survey-craft-marker'));
    shuttle.position.set(0, 1.45, -29.5);
    group.add(shuttle);
  }
}

function addDeckPropColliders(colliders, deckId) {
  const add = (x, z, width, depth, height, id) => colliders.push(colliderForBox(x, z, width, depth, 0, height, `ship-prop:${id}`));
  if (deckId === 'command') {
    [[-4.5, 32.1], [4.5, 32.1], [0, 27.2]].forEach(([x, z], index) => add(x, z, 2.7, 2.35, 1.85, `bridge-console-${index}`));
    [[-8.2, 15.5], [8.2, 15.5], [-8.2, 0.5], [8.2, 0.5], [-8.2, -14.5]].forEach(([x, z], index) => add(x, z, 2.35, 2.7, 1.85, `science-console-${index}`));
    add(-8.1, -3.3, 1.7, 4.6, 1.9, 'sample-analysis-bench');
    add(-8.1, -18.2, 1.7, 4.6, 1.9, 'data-instrument-bench');
    add(7.8, -14.5, 6.2, 4.6, 1.2, 'briefing-table');
  } else if (deckId === 'habitat') {
    add(-7.6, 26.1, 7.9, 2.05, 2.2, 'galley');
    add(1.5, 30.2, 7.4, 2.9, 1.2, 'wardroom-table');
    [11.2, 15.4, 19.6].forEach((z, index) => add(-8.2, z, 2.5, 3.7, 1.9, `medical-bed-${index}`));
    add(6.8, 15.5, 2.1, 5.1, 1.5, 'treadmill');
    add(10.2, 18, 3, 1.2, 2.7, 'resistance-frame');
    [[-8.5, -3.15], [-8.5, 3.15], [8.5, -3.15], [8.5, 3.15]].forEach(([x, z], index) => add(x, z, 2.7, 3.8, 3, `bunk-${index}`));
    [[-8.2, -11.2], [-8.2, -17.7], [8.2, -11.2], [8.2, -17.7]].forEach(([x, z], index) => add(x, z, 3.9, 1.5, 3, `life-support-${index}`));
    [-33, -29, -25].forEach((z, index) => add(-8.2, z, 3.8, 1.75, 3, `hydroponics-${index}`));
    [-32.2, -28, -24.8].forEach((z, index) => add(8.3, z, 2.5, 2.55, 2, `shelter-stores-${index}`));
  } else {
    add(0, 30.5, 4.1, 6.2, 4.4, 'propulsion-core');
    add(-4.5, 31.2, 2.7, 2.35, 1.85, 'propulsion-console');
    add(4.5, 31.2, 2.7, 2.35, 1.85, 'engineering-console');
    [[-9.7, 15.5], [-6.9, 15.5]].forEach(([x, z], index) => add(x, z, 1.45, 2.4, 3.1, `power-cabinet-${index}`));
    [[8.2, 12.4], [8.2, 18.7]].forEach(([x, z], index) => add(x, z, 4.8, 2, 2.5, `thermal-${index}`));
    add(-8, 0.5, 2.35, 2.7, 1.85, 'fabricator-console');
    add(-8.2, -3.7, 4.7, 1.7, 1.5, 'fabrication-bench');
    [-3.6, 0, 3.6].forEach((z, index) => add(8.2, z, 2.55, 2.6, 2, `cargo-${index}`));
    add(-8.3, -14.5, 3.2, 3.2, 3.6, 'resource-processor');
    [6.2, 8.2, 10.2].forEach((x, index) => add(x, -14.5, 1.5, 1.25, 3.1, `eva-suit-${index}`));
    add(0, -29.5, 8.2, 10.2, 3.8, 'local-survey-craft');
  }
}

function addBridgeView(group) {
  const glass = material(0x061426, { emissive: 0x071c35, emissiveIntensity: 0.24, roughness: 0.18, metalness: 0.08 });
  glass.transparent = true;
  glass.opacity = 0.48;
  glass.depthWrite = false;
  box(group, { x: 18, y: 2.2, z: 0.12 }, { x: 0, y: 2, z: 35.82 }, glass, 'bridge-forward-window');
  const points = [];
  for (let index = 0; index < 90; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 4 + (index % 17) * 0.72;
    points.push(Math.cos(angle) * radius, 0.7 + (index % 11) * 0.55, 39 + Math.sin(angle) * 5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xeaf6ff, size: 0.09, sizeAttenuation: true }));
  stars.name = 'ship-window-starfield';
  group.add(stars);
}

function roomLabelTexture(label, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#071421';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = `#${accentColor.toString(16).padStart(6, '0')}`;
  context.fillRect(0, 0, 14, canvas.height);
  context.strokeStyle = 'rgba(160,220,245,.75)';
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.fillStyle = '#eefaff';
  context.font = '700 34px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const words = String(label).toUpperCase().split(' ');
  let line = '';
  const lines = [];
  words.forEach((word) => {
    const next = `${line} ${word}`.trim();
    if (context.measureText(next).width > 430 && line) { lines.push(line); line = word; }
    else line = next;
  });
  if (line) lines.push(line);
  const visible = lines.slice(0, 2);
  visible.forEach((text, index) => context.fillText(text, 270, visible.length === 1 ? 64 : 45 + index * 40));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addDoorArchitecture(group, door, room, accentColor) {
  const frameSurface = material(0x26394a, { emissive: accentColor, emissiveIntensity: 0.16, metalness: 0.62, roughness: 0.32 });
  const signal = material(accentColor, { emissive: accentColor, emissiveIntensity: 0.9, metalness: 0.18, roughness: 0.28 });
  if (door.orientation === 'side') {
    [-1.08, 1.08].forEach((offset) => box(group, { x: 0.36, y: 3.12, z: 0.2 }, { x: door.x, y: 1.56, z: door.z + offset }, frameSurface, `door-frame:${door.id}`));
    box(group, { x: 0.36, y: 0.22, z: 2.34 }, { x: door.x, y: 3.12, z: door.z }, frameSurface, `door-header:${door.id}`);
    box(group, { x: 0.08, y: 0.34, z: 0.12 }, { x: door.x + (room.side === 'port' ? 0.22 : -0.22), y: 2.42, z: door.z + 1.22 }, signal, `door-status:${door.id}`);
  } else {
    [-1.08, 1.08].forEach((offset) => box(group, { x: 0.2, y: 3.12, z: 0.36 }, { x: door.x + offset, y: 1.56, z: door.z }, frameSurface, `door-frame:${door.id}`));
    box(group, { x: 2.34, y: 0.22, z: 0.36 }, { x: door.x, y: 3.12, z: door.z }, frameSurface, `door-header:${door.id}`);
    box(group, { x: 0.12, y: 0.34, z: 0.08 }, { x: door.x + 1.22, y: 2.42, z: door.z - 0.22 }, signal, `door-status:${door.id}`);
  }
  const labelSurface = new THREE.MeshBasicMaterial({ map: roomLabelTexture(room.label, accentColor), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 0.58), labelSurface);
  label.name = `room-sign:${room.id}`;
  label.position.set(door.x, 2.75, door.z);
  if (door.orientation === 'side') {
    label.position.x += room.side === 'port' ? 0.195 : -0.195;
    label.rotation.y = Math.PI / 2;
  } else {
    label.position.z += room.minZ >= 23 ? -0.195 : 0.195;
  }
  group.add(label);
}

function addDeckArchitecture(group, deckDefinition, accentColor) {
  const rib = material(0x34495d, { metalness: 0.54, roughness: 0.38 });
  const strip = material(accentColor, { emissive: accentColor, emissiveIntensity: 1.1, metalness: 0.08, roughness: 0.24 });
  [-31, -23, -15, -7, 1, 9, 17, 25, 33].forEach((z) => {
    box(group, { x: 0.18, y: 3.18, z: 0.34 }, { x: -12.82, y: 1.59, z }, rib, `hull-rib:${deckDefinition.id}`);
    box(group, { x: 0.18, y: 3.18, z: 0.34 }, { x: 12.82, y: 1.59, z }, rib, `hull-rib:${deckDefinition.id}`);
  });
  [-30, -18, -6, 6, 18, 30].forEach((z) => {
    box(group, { x: 3.75, y: 0.045, z: 0.16 }, { x: 0, y: 0.055, z }, strip, `floor-route:${deckDefinition.id}`);
    box(group, { x: 2.9, y: 0.05, z: 1.25 }, { x: 0, y: 3.37, z }, strip, `ceiling-light:${deckDefinition.id}`);
  });
  SHIP_DOORS.filter((door) => door.deckId === deckDefinition.id).forEach((door) => {
    const room = deckDefinition.rooms.find((entry) => entry.id === door.roomId);
    if (room) addDoorArchitecture(group, door, room, accentColor);
  });
}

function buildDeckScene(deckDefinition) {
  const group = new THREE.Group();
  group.name = `surveyor-deck:${deckDefinition.id}`;
  const colliders = [];
  const doorStates = [];
  const deckSurface = material(0x283444, { roughness: 0.72, metalness: 0.36 });
  const wallSurface = material(0xb8c3cf, { roughness: 0.66, metalness: 0.2, emissive: 0x111820, emissiveIntensity: 0.12 });
  const ceiling = material(0x5f6f80, { roughness: 0.74, metalness: 0.22, emissive: 0x18212b, emissiveIntensity: 0.18 });
  const corridor = material(0x314d64, { roughness: 0.58, metalness: 0.3 });
  const accentColor = deckDefinition.id === 'command' ? 0x2d9ec4 : deckDefinition.id === 'habitat' ? 0x4d9f79 : 0xc47742;
  const accent = material(accentColor, { emissive: accentColor, emissiveIntensity: 0.38, roughness: 0.4 });

  box(group, { x: 26, y: 0.18, z: 72 }, { x: 0, y: -0.08, z: 0 }, deckSurface, `${deckDefinition.id}:deck`);
  box(group, { x: 4.9, y: 0.04, z: 69.5 }, { x: 0, y: 0.03, z: 0 }, corridor, `${deckDefinition.id}:corridor`);
  box(group, { x: 26, y: 0.16, z: 72 }, { x: 0, y: 3.48, z: 0 }, ceiling, `${deckDefinition.id}:ceiling`);
  wall(group, colliders, { x: -13, z: -36 }, { x: -13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-port`);
  wall(group, colliders, { x: 13, z: -36 }, { x: 13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-starboard`);
  wall(group, colliders, { x: -13, z: -36 }, { x: 13, z: -36 }, wallSurface, `${deckDefinition.id}:hull-aft`);
  wall(group, colliders, { x: -13, z: 36 }, { x: 13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-forward`);
  [24, 8, -7, -22].forEach((z, index) => partitionWithDoor(group, colliders, -13, 13, z, 0, wallSurface, `${deckDefinition.id}:zone:${index}`));
  deckDefinition.rooms.filter((room) => room.side !== 'full').forEach((room) => {
    const x = room.side === 'port' ? -2.7 : 2.7;
    sidePartitionWithDoor(group, colliders, x, room.minZ, room.maxZ, (room.minZ + room.maxZ) * 0.5, wallSurface, `${deckDefinition.id}:room-wall:${room.id}`);
  });
  deckDefinition.rooms.forEach((room) => {
    const stripeX = room.side === 'port' ? room.maxX - 0.08 : room.side === 'starboard' ? room.minX + 0.08 : room.minX + 0.12;
    box(group, {
      x: room.side === 'full' ? room.maxX - room.minX - 1 : 0.09,
      y: 0.05,
      z: room.side === 'full' ? 0.09 : room.maxZ - room.minZ - 1
    }, {
      x: room.side === 'full' ? (room.minX + room.maxX) * 0.5 : stripeX,
      y: 0.04,
      z: room.side === 'full' ? (room.minZ >= 23 ? room.minZ + 0.7 : room.maxZ - 0.7) : (room.minZ + room.maxZ) * 0.5
    }, accent, `room-marker:${room.id}`);
  });
  SHIP_DOORS.filter((door) => door.deckId === deckDefinition.id).forEach((door) => {
    const panel = box(group,
      door.orientation === 'side' ? { x: 0.14, y: 2.65, z: 1.85 } : { x: 1.85, y: 2.65, z: 0.14 },
      { x: door.x, y: 1.33, z: door.z },
      material(0x263b50, { emissive: accentColor, emissiveIntensity: 0.22, metalness: 0.48, roughness: 0.36 }),
      door.id
    );
    const collider = colliderForBox(door.x, door.z, door.orientation === 'side' ? 0.22 : 1.9, door.orientation === 'side' ? 1.9 : 0.22, 0, 2.8, door.id);
    doorStates.push({ ...door, open: false, panel, collider, targetY: 1.33 });
  });
  addDeckArchitecture(group, deckDefinition, accentColor);
  addDeckDetails(group, deckDefinition.id);
  addDeckPropColliders(colliders, deckDefinition.id);
  group.add(new THREE.HemisphereLight(0xcde7ff, 0x162130, 1.02));
  const fill = new THREE.DirectionalLight(0xf4f7ff, 1.12);
  fill.position.set(8, 18, 8);
  group.add(fill);
  [-29, -15, 0, 15, 29].forEach((z) => {
    const light = new THREE.PointLight(deckDefinition.id === 'engineering' ? 0xffc49a : 0xbde9ff, 0.72, 22, 2);
    light.position.set(0, 3.18, z);
    group.add(light);
  });
  const alertLight = new THREE.PointLight(0xff6b45, 0, 30, 2);
  alertLight.position.set(0, 3.1, 0);
  alertLight.name = `ship-alert-light:${deckDefinition.id}`;
  group.add(alertLight);
  return { group, colliders, doorStates, alertLight };
}

function buildSurveyorScene(expedition) {
  const root = new THREE.Group();
  root.name = 'expedition-ship:surveyor';
  root.userData.environmentOwner = 'SPACE_FLIGHT:SHIP_INTERIOR';
  const deckStates = new Map();
  SHIP_DECKS.forEach((deckDefinition, index) => {
    const state = buildDeckScene(deckDefinition);
    state.group.visible = index === 0;
    root.add(state.group);
    deckStates.set(deckDefinition.id, state);
  });
  const crewLayer = new THREE.Group();
  crewLayer.name = 'surveyor-crew-layer';
  root.add(crewLayer);
  const crewById = new Map((expedition?.crew || []).map((crew) => [crew.id, crew]));
  const crewMeshes = SHIP_CREW_POSTS.map((post) => addCrewMember(crewLayer, post, crewById.get(post.crewId)));
  crewMeshes.forEach((mesh) => { mesh.visible = mesh.userData.deckId === 'command'; });
  const animatedParts = [];
  const profileId = expedition?.ship?.profileId;
  if (profileId === 'cryogenic-expedition-vessel') {
    const habitat = deckStates.get('habitat');
    const shell = material(0x71889b, { metalness: 0.52, roughness: 0.34 });
    const glass = material(0x76d8ff, { emissive: 0x1f6f8b, emissiveIntensity: 0.46, metalness: 0.08, roughness: 0.2 });
    glass.transparent = true; glass.opacity = 0.46;
    [11.1, 15.5, 19.9].forEach((z, index) => {
      const pod = new THREE.Group();
      pod.name = `cryogenic-pod:${index + 1}`;
      box(pod, { x: 2.1, y: 1.1, z: 3.4 }, { x: 0, y: 0.65, z: 0 }, shell, `cryogenic-shell:${index + 1}`);
      const canopy = box(pod, { x: 1.65, y: 0.55, z: 2.35 }, { x: 0, y: 1.18, z: 0.15 }, glass, `cryogenic-canopy:${index + 1}`);
      canopy.userData.shipAnimated = 'screen'; canopy.userData.baseEmissiveIntensity = 0.46;
      pod.position.set(-11, 0, z);
      habitat.group.add(pod);
      habitat.colliders.push(colliderForBox(-11, z, 2.2, 3.5, 0, 1.5, `cryogenic-pod:${index + 1}`));
    });
  } else if (profileId === 'generation-ship') {
    const command = deckStates.get('command');
    [-18.5, -15.2, -11.9].forEach((z, index) => addWallServicePanel(command.group, 11.6, z, -Math.PI / 2, index === 0 ? 0xb6a4ff : 0x76d8ff, `continuity-archive-${index + 1}`));
  }
  root.traverse((child) => { if (child.userData?.shipAnimated) animatedParts.push(child); });
  return {
    root,
    deckStates,
    crewMeshes,
    crewLayer,
    animatedParts,
    walkSurface: {
      kind: 'polygon',
      pts: [
        { x: SHIP_DECK_BOUNDS.minX, z: SHIP_DECK_BOUNDS.minZ },
        { x: SHIP_DECK_BOUNDS.maxX, z: SHIP_DECK_BOUNDS.minZ },
        { x: SHIP_DECK_BOUNDS.maxX, z: SHIP_DECK_BOUNDS.maxZ },
        { x: SHIP_DECK_BOUNDS.minX, z: SHIP_DECK_BOUNDS.maxZ }
      ],
      y: 0,
      label: 'Surveyor deck'
    }
  };
}

function ensureShipHud(expedition, crewSummary = null) {
  let hud = document.getElementById('shipInteriorHud');
  if (!hud) {
    hud = document.createElement('section');
    hud.id = 'shipInteriorHud';
    document.body.appendChild(hud);
  }
  const progress = Math.round((Number(expedition?.progress) || 0) * 100);
  const crewLine = crewSummary ? `${crewSummary.active} on duty · ${crewSummary.resting} resting` : 'Crew watch active';
  const deckLabel = getShipDeck(activeSession?.activeDeckId)?.shortLabel || 'Command';
  const alert = shipAlertState(expedition);
  hud.classList.toggle('attention', alert.level === 'attention');
  hud.classList.toggle('critical', alert.level === 'critical');
  hud.innerHTML = `<div><span>${String(expedition?.ship?.name || 'Surveyor').toUpperCase()} · ${deckLabel.toUpperCase()} DECK</span><strong>${expedition?.state === 'planned' ? 'Expedition staging' : `${progress}% to ${String(expedition?.destinationId || 'destination').replaceAll('-', ' ')}`}</strong><small>${crewLine} · E interacts · M opens ship map</small><em class="ship-alert ship-alert-${alert.level}">${alert.message}</em></div><div><button id="shipMapButton" type="button">Map</button><button id="shipJournalButton" type="button">Journal</button><button id="shipExitButton" type="button">Return to flight</button></div>`;
  hud.classList.add('show');
  hud.querySelector('#shipExitButton')?.addEventListener('click', () => exitSurveyorInterior());
  hud.querySelector('#shipJournalButton')?.addEventListener('click', () => appCtx.toggleWorldDiscoveryJournal?.(true));
  hud.querySelector('#shipMapButton')?.addEventListener('click', () => toggleShipMap());
  return hud;
}

function ensureShipAudio(session = activeSession) {
  if (!session || session.audioContext) return session?.audioContext || null;
  const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 46;
    gain.gain.value = 0.0025;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    session.audioContext = context;
    session.ambientOscillator = oscillator;
    return context;
  } catch {
    return null;
  }
}

function playShipTone(kind = 'operation') {
  const context = ensureShipAudio();
  if (!context) return false;
  if (context.state === 'suspended') void context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = kind === 'door' ? 'sine' : kind === 'alert' ? 'sawtooth' : 'triangle';
  oscillator.frequency.setValueAtTime(kind === 'door' ? 180 : kind === 'alert' ? 132 : 320, context.currentTime);
  if (kind === 'operation') oscillator.frequency.linearRampToValueAtTime(430, context.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(kind === 'alert' ? 0.035 : 0.022, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.26);
  return true;
}

function playExpeditionShipAction(details = {}) {
  const session = activeSession;
  if (!session) return false;
  const station = details.interaction || SHIP_STATIONS.find((entry) => entry.id === details.stationId);
  if (!station) return false;
  session.actionFeedback = {
    actionId: details.actionId || 'operation',
    label: details.message || station.label || 'Ship operation complete',
    deckId: station.deckId || session.activeDeckId,
    x: Number(station.x) || 0,
    z: Number(station.z) || 0,
    elapsed: 0,
    duration: 1.8
  };
  const state = session.sceneState.deckStates.get(session.actionFeedback.deckId);
  if (state && !state.actionBeacon) {
    const surface = material(0x6fe8ff, { emissive: 0x6fe8ff, emissiveIntensity: 1.5, metalness: 0.1, roughness: 0.2 });
    state.actionBeacon = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.055, 10, 32), surface);
    state.actionBeacon.rotation.x = Math.PI / 2;
    state.group.add(state.actionBeacon);
  }
  if (state?.actionBeacon) {
    state.actionBeacon.position.set(session.actionFeedback.x, 1.25, session.actionFeedback.z);
    state.actionBeacon.visible = true;
  }
  let cue = document.getElementById('shipActionCue');
  if (!cue) { cue = document.createElement('div'); cue.id = 'shipActionCue'; document.body.appendChild(cue); }
  cue.textContent = session.actionFeedback.label;
  cue.classList.add('show');
  playShipTone(details.kind === 'alert' ? 'alert' : 'operation');
  return true;
}

function snapshotWalkingState() {
  const walker = appCtx.Walk?.state?.walker;
  return {
    mode: appCtx.Walk?.state?.mode,
    view: appCtx.Walk?.state?.view,
    walker: walker ? {
      x: walker.x, y: walker.y, z: walker.z, angle: walker.angle, yaw: walker.yaw,
      pitch: walker.pitch, lookYawOffset: walker.lookYawOffset, vy: walker.vy
    } : null,
    car: appCtx.car ? { x: appCtx.car.x, y: appCtx.car.y, z: appCtx.car.z, angle: appCtx.car.angle } : null
  };
}

function applyShipWalkingState() {
  const walker = appCtx.Walk.state.walker;
  Object.assign(walker, { x: 0, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, z: 20.5, angle: 0, yaw: 0, pitch: 0, lookYawOffset: 0, vy: 0, onGround: true });
  appCtx.Walk.setModeWalk({ preserveResolvedSpawn: true, preserveResolvedSurface: true });
  appCtx.Walk.state.view = 'first';
  if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
  if (appCtx.car) Object.assign(appCtx.car, { x: walker.x, y: 1.2, z: walker.z, angle: walker.angle });
}

function restoreWalkingState(saved) {
  const walker = appCtx.Walk?.state?.walker;
  if (walker && saved?.walker) Object.assign(walker, saved.walker);
  if (appCtx.car && saved?.car) Object.assign(appCtx.car, saved.car);
  if (appCtx.Walk?.state) {
    appCtx.Walk.state.mode = saved?.mode || 'drive';
    appCtx.Walk.state.view = saved?.view || 'third';
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.view !== 'first';
    }
  }
}

function activeDeckState(session = activeSession) {
  return session?.sceneState?.deckStates?.get(session.activeDeckId) || null;
}

function activeDeckColliders(session = activeSession) {
  const state = activeDeckState(session);
  if (!state) return [];
  return [...state.colliders, ...state.doorStates.filter((door) => !door.open).map((door) => door.collider)];
}

function activeDeckInteractions(session = activeSession) {
  if (!session) return [];
  const profileId = session.expedition?.ship?.profileId;
  const stations = SHIP_STATIONS.filter((station) => station.deckId === session.activeDeckId)
    .filter((station) => station.id !== 'cryogenic-status' || profileId === 'cryogenic-expedition-vessel')
    .filter((station) => station.id !== 'generation-continuity' || profileId === 'generation-ship')
    .map((station) => ({
    ...station,
    kind: station.id.startsWith('deck-lift:') ? 'ship-lift' : 'ship-station',
    level: 0
  }));
  const doors = SHIP_DOORS.filter((door) => door.deckId === session.activeDeckId).map((door) => ({
    ...door,
    kind: 'ship-door',
    level: 0
  }));
  if (session.activeDeckId === 'command') {
    stations.push({ id: 'return-to-flight', deckId: 'command', roomId: 'bridge', label: 'Return to flight controls', x: 0, z: 25.8, radius: 2.1, kind: 'ship-exit', level: 0 });
  }
  return stations.concat(doors);
}

function updateActiveDeckContract(session = activeSession) {
  if (!session || !appCtx.activeInterior) return;
  const deck = getShipDeck(session.activeDeckId);
  appCtx.replaceWorldCollection('dynamicBuildingColliders', activeDeckColliders(session));
  appCtx.activeInterior.interactions = activeDeckInteractions(session);
  appCtx.activeInterior.floorId = `surveyor-${session.activeDeckId}`;
  appCtx.activeInterior.floorLabel = deck?.label || session.activeDeckId;
  appCtx.activeInterior.activeLevel = SHIP_DECKS.findIndex((entry) => entry.id === session.activeDeckId);
  appCtx.activeInterior.loadedLevels = [appCtx.activeInterior.activeLevel];
}

function switchSurveyorDeck(deckId) {
  const session = activeSession;
  const nextDeck = getShipDeck(deckId);
  if (!session || !nextDeck || deckId === session.activeDeckId) return false;
  session.sceneState.deckStates.forEach((state, id) => { state.group.visible = id === deckId; });
  session.activeDeckId = deckId;
  session.mapDeckId = deckId;
  const walker = appCtx.Walk.state.walker;
  Object.assign(walker, { x: 0, z: 2.8, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, vy: 0, onGround: true });
  refreshCrewOperations(session, true);
  updateActiveDeckContract(session);
  renderShipMaps(session);
  ensureShipHud(session.expedition, session.operationSummary);
  appCtx.showToast?.(nextDeck.label);
  return true;
}

function showDeckLift() {
  const session = activeSession;
  if (!session) return false;
  let picker = document.getElementById('shipDeckPicker');
  if (!picker) {
    picker = document.createElement('section');
    picker.id = 'shipDeckPicker';
    document.body.appendChild(picker);
  }
  picker.innerHTML = `<div><span>DECK LIFT</span><strong>Choose a deck</strong>${SHIP_DECKS.map((deck) => `<button type="button" data-deck="${deck.id}" ${deck.id === session.activeDeckId ? 'disabled' : ''}>${deck.label}</button>`).join('')}<button type="button" data-close>Cancel</button></div>`;
  picker.classList.add('show');
  picker.querySelectorAll('[data-deck]').forEach((button) => button.addEventListener('click', () => {
    switchSurveyorDeck(button.dataset.deck);
    picker.classList.remove('show');
  }));
  picker.querySelector('[data-close]')?.addEventListener('click', () => picker.classList.remove('show'));
  return true;
}

function toggleShipDoor(doorId) {
  const session = activeSession;
  const state = activeDeckState(session);
  const door = state?.doorStates.find((entry) => entry.id === doorId);
  if (!door) return false;
  door.open = !door.open;
  door.targetY = door.open ? 4.2 : 1.33;
  updateActiveDeckContract(session);
  renderShipMaps(session);
  appCtx.showToast?.(`${door.label} ${door.open ? 'open' : 'closed'}.`);
  playShipTone('door');
  return true;
}

function mapPoint(x, z) {
  return {
    x: ((x - SHIP_DECK_BOUNDS.minX) / (SHIP_DECK_BOUNDS.maxX - SHIP_DECK_BOUNDS.minX)) * 100,
    y: ((SHIP_DECK_BOUNDS.maxZ - z) / (SHIP_DECK_BOUNDS.maxZ - SHIP_DECK_BOUNDS.minZ)) * 100
  };
}

function routePolyline(session, deckId) {
  if (!session.selectedRoomId || deckId !== session.activeDeckId || getShipDeckForRoom(session.selectedRoomId) !== deckId) return '';
  const room = SHIP_ROOMS.find((entry) => entry.id === session.selectedRoomId);
  const door = SHIP_DOORS.find((entry) => entry.roomId === session.selectedRoomId);
  const walker = appCtx.Walk.state.walker;
  const center = { x: (room.minX + room.maxX) * 0.5, z: (room.minZ + room.maxZ) * 0.5 };
  const points = [mapPoint(walker.x, walker.z), mapPoint(0, walker.z), mapPoint(0, door.z), mapPoint(door.x, door.z), mapPoint(center.x, center.z)];
  return `<svg class="ship-map-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"/></svg>`;
}

function deckMapMarkup(session, deckId, compact = false) {
  const deck = getShipDeck(deckId);
  if (!deck) return '';
  const walker = appCtx.Walk.state.walker;
  const player = mapPoint(walker.x, walker.z);
  const state = session.sceneState.deckStates.get(deckId);
  const crew = session.sceneState.crewMeshes.filter((mesh) => mesh.userData.deckId === deckId);
  return `<div class="ship-map-deck ${compact ? 'compact' : ''}" data-deck-map="${deckId}">
    ${routePolyline(session, deckId)}
    ${deck.rooms.map((room) => {
      const a = mapPoint(room.minX, room.maxZ);
      const b = mapPoint(room.maxX, room.minZ);
      const status = session.expedition?.systems?.[room.systemId]?.status || 'optimal';
      return `<button type="button" class="ship-map-room status-${status} ${session.selectedRoomId === room.id ? 'selected' : ''}" data-room="${room.id}" style="left:${a.x}%;top:${a.y}%;width:${b.x - a.x}%;height:${b.y - a.y}%" title="${room.label}">${compact ? '' : `<span>${room.label}</span>`}</button>`;
    }).join('')}
    ${(state?.doorStates || []).map((door) => { const point = mapPoint(door.x, door.z); return `<i class="ship-map-door ${door.open ? 'open' : ''}" style="left:${point.x}%;top:${point.y}%"></i>`; }).join('')}
    ${deckId === session.activeDeckId ? `<i class="ship-map-player" style="left:${player.x}%;top:${player.y}%"></i>` : ''}
    ${crew.map((mesh) => { const point = mapPoint(mesh.position.x, mesh.position.z); return `<i class="ship-map-crew" style="left:${point.x}%;top:${point.y}%" title="${mesh.userData.crewName}"></i>`; }).join('')}
  </div>`;
}

function renderShipMaps(session = activeSession) {
  if (!session) return;
  const mini = document.getElementById('shipMiniMap');
  if (mini) mini.innerHTML = `<header><span>${getShipDeck(session.activeDeckId)?.shortLabel}</span><button type="button" data-open-map>Map</button></header>${deckMapMarkup(session, session.activeDeckId, true)}`;
  mini?.querySelector('[data-open-map]')?.addEventListener('click', () => toggleShipMap(true));
  const overlay = document.getElementById('shipMapOverlay');
  if (overlay) {
    overlay.innerHTML = `<section><header><div><span>SURVEYOR</span><strong>Ship Map</strong></div><button type="button" data-close-map>×</button></header><nav>${SHIP_DECKS.map((deck) => `<button type="button" data-map-deck="${deck.id}" class="${deck.id === session.mapDeckId ? 'active' : ''}">${deck.shortLabel}</button>`).join('')}</nav>${deckMapMarkup(session, session.mapDeckId, false)}<footer>${session.selectedRoomId ? `Guidance set: ${SHIP_ROOMS.find((room) => room.id === session.selectedRoomId)?.label}` : 'Choose a room for internal guidance. Use the deck lift to change decks.'}</footer></section>`;
    overlay.querySelector('[data-close-map]')?.addEventListener('click', () => toggleShipMap(false));
    overlay.querySelectorAll('[data-map-deck]').forEach((button) => button.addEventListener('click', () => { session.mapDeckId = button.dataset.mapDeck; renderShipMaps(session); }));
  }
  document.querySelectorAll('.ship-map-room[data-room]').forEach((button) => button.addEventListener('click', () => {
    session.selectedRoomId = button.dataset.room;
    renderShipMaps(session);
  }));
}

function toggleShipMap(show) {
  const overlay = document.getElementById('shipMapOverlay');
  if (!activeSession || !overlay) return false;
  const next = show === undefined ? !overlay.classList.contains('show') : show === true;
  overlay.classList.toggle('show', next);
  if (next) renderShipMaps(activeSession);
  return next;
}

function updateExpeditionShipRecord(expedition) {
  if (!activeSession || !expedition || expedition.id !== activeSession.expedition?.id) return false;
  activeSession.expedition = expedition;
  syncCrewMeshes(activeSession, expedition);
  refreshCrewOperations(activeSession, true);
  renderShipMaps(activeSession);
  ensureShipHud(expedition, activeSession.operationSummary);
  return true;
}

function ensureShipMaps(session) {
  if (!document.getElementById('expeditionShipStyles')) {
    const link = document.createElement('link');
    link.id = 'expeditionShipStyles';
    link.rel = 'stylesheet';
    link.href = 'styles/expedition-ship.css?v=3';
    document.head.appendChild(link);
  }
  let mini = document.getElementById('shipMiniMap');
  if (!mini) { mini = document.createElement('aside'); mini.id = 'shipMiniMap'; document.body.appendChild(mini); }
  let overlay = document.getElementById('shipMapOverlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'shipMapOverlay'; document.body.appendChild(overlay); }
  mini.classList.add('show');
  renderShipMaps(session);
}

function enterSurveyorInterior(options = {}) {
  if (activeSession || !appCtx.spaceFlight?.active || !appCtx.Walk || !appCtx.scene) return false;
  const sceneState = buildSurveyorScene(options.expedition);
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  const session = {
    expedition: options.expedition || null,
    onInteraction: typeof options.onInteraction === 'function' ? options.onInteraction : null,
    onExit: typeof options.onExit === 'function' ? options.onExit : null,
    spaceWasActive: appCtx.spaceFlight.active === true,
    planetaryPauseWasActive: appCtx.hasPauseReason?.('planetary_transition') === true,
    walking: snapshotWalkingState(),
    dynamicBuildingColliders: [...(appCtx.dynamicBuildingColliders || [])],
    sceneBackground: appCtx.scene.background,
    shadowMapEnabled: appCtx.renderer?.shadowMap?.enabled === true,
    interiorPromptDisplay: document.getElementById('interiorPrompt')?.style.display || '',
    overlayDisplays: Object.fromEntries(['mainMenuBtn', 'gameShareFloatBtn', 'tutorialHintCard'].map((id) => [id, document.getElementById(id)?.style.display || ''])),
    skyVisibility: Object.fromEntries(['sunSphere', 'moonSphere', 'starField'].map((key) => [key, appCtx[key]?.visible !== false])),
    sceneState,
    worldCanvas,
    activeDeckId: 'command',
    mapDeckId: 'command',
    selectedRoomId: null,
    mapRefreshElapsed: 0,
    bodyHadShipInteriorClass: document.body.classList.contains('expedition-ship-interior-open'),
    operations: Object.freeze([]),
    operationSummary: null,
    operationRefreshElapsed: 0,
    visualClock: 0,
    audioContext: null,
    ambientOscillator: null,
    actionFeedback: null
  };
  activeSession = session;
  syncCrewMeshes(session, options.expedition);
  refreshCrewOperations(session, true);
  document.body.classList.add('expedition-ship-interior-open');

  if (appCtx.spaceFlight.animationId != null) cancelAnimationFrame(appCtx.spaceFlight.animationId);
  appCtx.spaceFlight.animationId = null;
  appCtx.spaceFlight.active = false;
  appCtx.spaceFlight.keys = {};
  appCtx.activeShipInterior = true;
  if (appCtx.spaceFlight.canvas) appCtx.spaceFlight.canvas.style.display = 'none';
  if (appCtx.spaceFlight.hud) appCtx.spaceFlight.hud.style.display = 'none';
  appCtx.hideSolarSystemUI?.();
  appCtx.hideUniverseUI?.();
  ['mainMenuBtn', 'gameShareFloatBtn', 'tutorialHintCard'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
  });
  if (worldCanvas) worldCanvas.style.display = 'block';
  appCtx.setEarthSceneVisible?.(false);
  ['sunSphere', 'moonSphere', 'starField'].forEach((key) => {
    if (appCtx[key]) appCtx[key].visible = false;
  });
  appCtx.scene.add(sceneState.root);
  appCtx.replaceWorldCollection('dynamicBuildingColliders', activeDeckColliders(session));

  appCtx.activeInterior = {
    key: 'expedition-ship:surveyor',
    label: options.expedition?.ship?.name || 'Surveyor',
    mode: 'authored-ship',
    environmentKind: 'expedition-ship',
    group: sceneState.root,
    walkSurfaces: [sceneState.walkSurface],
    placementTargets: [],
    center: { x: 0, z: 0 },
    usableFootprint: sceneState.walkSurface.pts,
    floorPlan: { floorCount: SHIP_DECKS.length, storyHeight: 3.5 },
    floorId: 'surveyor-command',
    floorLabel: getShipDeck('command').label,
    floorBaseY: 0,
    activeLevel: 0,
    loadedLevels: [0],
    connector: null,
    stairs: [],
    interactions: activeDeckInteractions(session),
    entryPoint: { x: 0, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, z: 20.5 },
    lastValidPosition: { x: 0, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, z: 20.5, yaw: 0, angle: 0 },
    containmentNoticeUntil: 0
  };
  appCtx.interiorHint = { state: 'inside', label: options.expedition?.ship?.name || 'Surveyor', mode: 'authored-ship' };
  appCtx.setPauseReason?.('planetary_transition', false);
  applyShipWalkingState();
  appCtx.scene.background = new THREE.Color(0x02050b);
  appCtx.renderer.shadowMap.enabled = true;
  const interiorPrompt = document.getElementById('interiorPrompt');
  if (interiorPrompt) interiorPrompt.style.display = '';
  appCtx.renderLoop?.();
  ensureShipMaps(session);
  ensureShipHud(options.expedition, session.operationSummary);
  appCtx.updateControlsModeUI?.();
  return true;
}

function exitSurveyorInterior() {
  const session = activeSession;
  if (!session) return false;
  activeSession = null;
  document.getElementById('shipInteriorHud')?.classList.remove('show');
  document.getElementById('shipMiniMap')?.classList.remove('show');
  document.getElementById('shipMapOverlay')?.classList.remove('show');
  document.getElementById('shipDeckPicker')?.classList.remove('show');
  document.getElementById('shipStationPanel')?.classList.remove('show');
  document.getElementById('shipActionCue')?.classList.remove('show');
  appCtx.toggleWorldDiscoveryJournal?.(false);
  appCtx.activeInterior = null;
  appCtx.interiorHint = null;
  appCtx.activeShipInterior = false;
  if (!session.bodyHadShipInteriorClass) document.body.classList.remove('expedition-ship-interior-open');
  appCtx.replaceWorldCollection('dynamicBuildingColliders', session.dynamicBuildingColliders);
  session.sceneState.root.parent?.remove?.(session.sceneState.root);
  session.sceneState.root.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((entry) => { entry?.map?.dispose?.(); entry?.dispose?.(); });
    else { child.material?.map?.dispose?.(); child.material?.dispose?.(); }
  });
  try { session.ambientOscillator?.stop?.(); } catch {}
  void session.audioContext?.close?.();
  restoreWalkingState(session.walking);
  appCtx.scene.background = session.sceneBackground;
  if (appCtx.renderer?.shadowMap) appCtx.renderer.shadowMap.enabled = session.shadowMapEnabled;
  const interiorPrompt = document.getElementById('interiorPrompt');
  if (interiorPrompt) interiorPrompt.style.display = session.interiorPromptDisplay;
  Object.entries(session.overlayDisplays || {}).forEach(([id, display]) => {
    const element = document.getElementById(id);
    if (element) element.style.display = display;
  });
  Object.entries(session.skyVisibility || {}).forEach(([key, visible]) => {
    if (appCtx[key]) appCtx[key].visible = visible;
  });
  if (session.worldCanvas) session.worldCanvas.style.display = 'none';
  if (session.planetaryPauseWasActive) appCtx.setPauseReason?.('planetary_transition', true);
  if (session.spaceWasActive) {
    appCtx.spaceFlight.active = true;
    if (appCtx.spaceFlight.canvas) appCtx.spaceFlight.canvas.style.display = 'block';
    if (appCtx.spaceFlight.hud) appCtx.spaceFlight.hud.style.display = 'block';
    appCtx.animateSpaceFlight?.();
    appCtx.showSolarSystemUI?.();
    appCtx.showUniverseUI?.();
  }
  appCtx.updateControlsModeUI?.();
  session.onExit?.();
  return true;
}

function handleShipInteriorInteraction(interaction) {
  if (!activeSession || !interaction) return false;
  if (interaction.kind === 'ship-exit' || interaction.id === 'return-to-flight') return exitSurveyorInterior();
  if (interaction.kind === 'ship-door') return toggleShipDoor(interaction.id);
  if (interaction.kind === 'ship-lift' || interaction.id.startsWith('deck-lift:')) return showDeckLift();
  const result = activeSession.onInteraction?.(interaction, activeSession.expedition);
  return result !== false;
}

function updateExpeditionShipInterior(dt) {
  if (!activeSession) return false;
  const tutorialCard = document.getElementById('tutorialHintCard');
  if (tutorialCard && tutorialCard.style.display !== 'none') tutorialCard.style.display = 'none';
  updateCrewMotion(activeSession, dt);
  activeSession.visualClock += Math.max(0, Number(dt) || 0);
  const alert = shipAlertState(activeSession.expedition);
  activeSession.sceneState.deckStates.forEach((deckState) => {
    if (!deckState.alertLight) return;
    const pulse = 0.55 + Math.sin(activeSession.visualClock * (alert.level === 'critical' ? 5.5 : 2.7)) * 0.25;
    deckState.alertLight.intensity = alert.level === 'critical' ? 2.1 * pulse : alert.level === 'attention' ? 0.85 * pulse : 0;
    deckState.alertLight.color.setHex(alert.level === 'critical' ? 0xff3b30 : 0xffa340);
  });
  activeSession.sceneState.animatedParts.forEach((part, index) => {
    if (!part.visible || !part.material) return;
    if (part.userData.shipAnimated === 'screen') {
      part.material.emissiveIntensity = Number(part.userData.baseEmissiveIntensity || 0.8) + Math.sin(activeSession.visualClock * 1.7 + index * 0.63) * 0.09;
    }
  });
  const state = activeDeckState(activeSession);
  state?.doorStates.forEach((door) => {
    door.panel.position.y += (door.targetY - door.panel.position.y) * Math.min(1, Math.max(0, dt) * 8);
  });
  if (activeSession.actionFeedback) {
    activeSession.actionFeedback.elapsed += Math.max(0, Number(dt) || 0);
    const feedbackState = activeSession.sceneState.deckStates.get(activeSession.actionFeedback.deckId);
    if (feedbackState?.actionBeacon) {
      feedbackState.actionBeacon.rotation.z += Math.max(0, Number(dt) || 0) * 2.8;
      feedbackState.actionBeacon.scale.setScalar(1 + Math.sin(activeSession.actionFeedback.elapsed * 8) * 0.12);
      feedbackState.actionBeacon.visible = activeSession.actionFeedback.elapsed < activeSession.actionFeedback.duration;
    }
    if (activeSession.actionFeedback.elapsed >= activeSession.actionFeedback.duration) {
      document.getElementById('shipActionCue')?.classList.remove('show');
      activeSession.actionFeedback = null;
    }
  }
  activeSession.mapRefreshElapsed += Math.max(0, Number(dt) || 0);
  if (activeSession.mapRefreshElapsed >= 0.25) {
    activeSession.mapRefreshElapsed = 0;
    renderShipMaps(activeSession);
  }
  return true;
}

function getShipInteriorSnapshot() {
  if (!activeSession) return null;
  return {
    active: true,
    shipId: 'surveyor',
    deckId: activeSession.activeDeckId,
    deckCount: SHIP_DECKS.length,
    roomCount: SHIP_ROOMS.length,
    stationCount: SHIP_STATIONS.length,
    doorCount: SHIP_DOORS.length,
    openDoorCount: [...activeSession.sceneState.deckStates.values()].flatMap((state) => state.doorStates).filter((door) => door.open).length,
    selectedRoomId: activeSession.selectedRoomId,
    shipMapVisible: document.getElementById('shipMapOverlay')?.classList.contains('show') === true,
    miniMapVisible: document.getElementById('shipMiniMap')?.classList.contains('show') === true,
    visibleCrewCount: activeSession.sceneState.crewMeshes.filter((mesh) => mesh.visible).length,
    totalCrewCount: activeSession.sceneState.crewMeshes.length,
    crewOperations: activeSession.operations.map((operation) => ({ ...operation })),
    crewOperationSummary: { ...activeSession.operationSummary },
    alert: shipAlertState(activeSession.expedition),
    actionFeedback: activeSession.actionFeedback ? { ...activeSession.actionFeedback } : null,
    audioState: activeSession.audioContext?.state || 'not-started',
    crewPresentation: activeSession.sceneState.crewMeshes.map((mesh) => ({
      crewId: mesh.userData.crewId,
      roomId: mesh.userData.currentRoomId,
      assignmentId: mesh.userData.assignmentId,
      task: mesh.userData.operationTask,
      x: Number(mesh.position.x.toFixed(3)),
      z: Number(mesh.position.z.toFixed(3)),
      moving: (mesh.userData.route?.length || 0) > 0
    })),
    parentEnvironment: 'SPACE_FLIGHT',
    movementAuthority: 'Walk',
    collisionAuthority: 'activeInterior'
  };
}

Object.assign(appCtx, {
  exitExpeditionShipInterior: exitSurveyorInterior,
  getShipInteriorSnapshot,
  handleShipInteriorInteraction,
  switchSurveyorDeck,
  toggleExpeditionShipMap: toggleShipMap,
  updateExpeditionShipRecord,
  playExpeditionShipAction,
  updateExpeditionShipInterior
});

export { enterSurveyorInterior, exitSurveyorInterior, getShipInteriorSnapshot, handleShipInteriorInteraction, playExpeditionShipAction, switchSurveyorDeck, toggleShipMap, updateExpeditionShipInterior, updateExpeditionShipRecord };
