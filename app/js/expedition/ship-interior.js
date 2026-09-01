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
} from './ship-layout.js?v=5';
import { deriveCrewOperations, summarizeCrewOperations } from './crew-operations.js?v=1';
import { shipAlertState } from './failure-authority.js?v=1';

let activeSession = null;

const INCIDENT_PROCEDURE_STEPS = Object.freeze({
  navigation: Object.freeze(['Inspect the flight solution', 'Align the reference frame', 'Confirm the safe course']),
  engineering: Object.freeze(['Isolate the affected system', 'Service the damaged assembly', 'Verify stable readings']),
  crew: Object.freeze(['Assess the crew member', 'Prepare the required support', 'Confirm recovery status']),
  science: Object.freeze(['Calibrate the instrument', 'Capture the observation', 'Validate the science record']),
  hazard: Object.freeze(['Secure the affected zone', 'Stabilize the ship system', 'Verify the compartment is safe']),
  discovery: Object.freeze(['Resolve the contact', 'Record the sensor pass', 'Confirm the field report']),
  social: Object.freeze(['Review the incoming signal', 'Prepare the ship response', 'Confirm the transmission']),
  default: Object.freeze(['Inspect the affected station', 'Complete the ship procedure', 'Verify the result'])
});

function procedureStepsFor(event = {}) {
  const steps = INCIDENT_PROCEDURE_STEPS[event.kind] || INCIDENT_PROCEDURE_STEPS.default;
  return Object.freeze(steps.map((label, index) => Object.freeze({ id: `step-${index + 1}`, label })));
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.58,
    metalness: options.metalness ?? 0.26,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    emissiveMap: options.emissiveMap || null,
    map: options.map || null,
    bumpMap: options.bumpMap || null,
    bumpScale: options.bumpScale ?? 0,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1
  });
}

function createShipDisplayTexture(label, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const accent = hexColor(accentColor);
  context.fillStyle = '#06101a';
  context.fillRect(0, 0, 512, 256);
  context.strokeStyle = 'rgba(150,205,225,.12)';
  context.lineWidth = 2;
  for (let x = 0; x <= 512; x += 64) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 256); context.stroke(); }
  for (let y = 0; y <= 256; y += 48) { context.beginPath(); context.moveTo(0, y); context.lineTo(512, y); context.stroke(); }
  context.fillStyle = accent;
  context.globalAlpha = 0.82;
  [0.72, 0.48, 0.88, 0.36].forEach((ratio, index) => context.fillRect(32, 72 + index * 34, 250 * ratio, 10));
  context.globalAlpha = 1;
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  for (let index = 0; index < 14; index += 1) {
    const x = 300 + index * 13;
    const y = 148 - Math.sin(index * 1.13 + label.length) * 34 - (index % 3) * 7;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.fillStyle = '#e8f7ff';
  context.font = '700 25px Arial, sans-serif';
  context.fillText(String(label).replaceAll('-', ' ').toUpperCase(), 28, 42);
  context.fillStyle = 'rgba(220,245,255,.7)';
  context.font = '16px monospace';
  context.fillText('SURVEYOR // ACTIVE', 302, 220);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

function createIncidentStepTexture(index, label, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  const accent = hexColor(accentColor);
  context.fillStyle = '#06121d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(178,220,235,.16)';
  context.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += 48) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 32) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
  }
  context.fillStyle = accent;
  context.fillRect(0, 0, 12, canvas.height);
  context.font = '700 64px Arial, sans-serif';
  context.fillText(String(index + 1).padStart(2, '0'), 28, 76);
  context.fillStyle = '#e8f7ff';
  context.font = '700 25px Arial, sans-serif';
  const words = String(label || 'SHIP PROCEDURE').toUpperCase().split(/\s+/);
  const first = words.slice(0, Math.ceil(words.length * 0.5)).join(' ');
  const second = words.slice(Math.ceil(words.length * 0.5)).join(' ');
  context.fillText(first.slice(0, 23), 30, 122);
  if (second) context.fillText(second.slice(0, 23), 30, 154);
  context.fillStyle = accent;
  context.fillRect(284, 42, 66, 8);
  context.fillRect(284, 66, 44, 8);
  context.fillRect(284, 90, 58, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

function deckAccent(deckId) {
  return deckId === 'command' ? 0x2d9ec4 : deckId === 'habitat' ? 0x4d9f79 : 0xc47742;
}

function hexColor(value) {
  return `#${Number(value || 0).toString(16).padStart(6, '0')}`;
}

function createShipPanelTexture(kind, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const accent = hexColor(accentColor);
  const palettes = {
    floor: ['#1f2a36', '#283542', '#111a24'],
    corridor: ['#243847', '#2d4658', '#101b25'],
    wall: ['#46545f', '#60707b', '#26323c'],
    ceiling: ['#2b3743', '#374654', '#17212b']
  };
  const [base, panel, seam] = palettes[kind] || palettes.floor;
  context.fillStyle = base;
  context.fillRect(0, 0, 512, 512);

  const cellX = kind === 'wall' ? 256 : 96;
  const cellY = kind === 'corridor' ? 128 : kind === 'wall' ? 256 : 96;
  for (let y = -cellY; y < 512 + cellY; y += cellY) {
    for (let x = -cellX; x < 512 + cellX; x += cellX) {
      const stagger = kind === 'wall' ? 0 : ((Math.floor(y / cellY) & 1) * cellX) / 2;
      const px = x + stagger;
      context.fillStyle = panel;
      context.fillRect(px + 4, y + 4, cellX - 8, cellY - 8);
      context.strokeStyle = seam;
      context.lineWidth = 3;
      context.strokeRect(px + 4, y + 4, cellX - 8, cellY - 8);
      context.strokeStyle = kind === 'wall' ? 'rgba(235,246,250,.18)' : 'rgba(220,240,250,.08)';
      context.lineWidth = 1;
      context.strokeRect(px + 9, y + 9, cellX - 18, cellY - 18);
      [[12, 12], [cellX - 12, 12], [12, cellY - 12], [cellX - 12, cellY - 12]].forEach(([fx, fy]) => {
        context.fillStyle = kind === 'wall' ? '#34424d' : '#788794';
        context.beginPath();
        context.arc(px + fx, y + fy, 2.3, 0, Math.PI * 2);
        context.fill();
      });
    }
  }

  context.globalAlpha = kind === 'wall' ? 0.2 : 0.32;
  context.fillStyle = accent;
  if (kind === 'wall') context.fillRect(0, 394, 512, 12);
  else if (kind === 'corridor') {
    context.fillRect(18, 0, 9, 512);
    context.fillRect(485, 0, 9, 512);
  } else if (kind === 'ceiling') {
    context.fillRect(246, 0, 20, 512);
  } else {
    context.fillRect(0, 246, 512, 10);
  }
  context.globalAlpha = 1;

  for (let index = 0; index < 42; index += 1) {
    const x = (index * 137 + 31) % 512;
    const y = (index * 83 + 17) % 512;
    const length = 10 + (index % 5) * 8;
    context.strokeStyle = kind === 'wall' ? 'rgba(40,52,61,.12)' : 'rgba(205,226,236,.06)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(Math.min(511, x + length), Math.max(0, y - 2 - (index % 4)));
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat = kind === 'corridor' ? [2, 18] : kind === 'wall' ? [3, 10] : kind === 'ceiling' ? [5, 16] : [7, 18];
  texture.repeat.set(...repeat);
  texture.anisotropy = Math.min(8, appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}

function shipSurfaceMaterial(kind, deckId) {
  const accentColor = deckAccent(deckId);
  const texture = createShipPanelTexture(kind, accentColor);
  const colors = {
    floor: 0x71808c,
    corridor: 0x6b8596,
    wall: 0xb3bec4,
    ceiling: 0x7b8993
  };
  return material(colors[kind] || colors.floor, {
    roughness: kind === 'wall' ? 0.58 : 0.46,
    metalness: kind === 'wall' ? 0.2 : 0.42,
    map: texture,
    bumpMap: texture,
    bumpScale: kind === 'wall' ? 0.012 : 0.022
  });
}

function shipDisplayMaterial(label, accent, intensity = 0.72) {
  const texture = createShipDisplayTexture(label, accent);
  return material(0xffffff, {
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: intensity,
    metalness: 0.04,
    roughness: 0.24
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
  const height = 3.42;
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

function hullWallWithViewport(group, colliders, z, openingWidth, surface, id) {
  const wallHeight = 3.42;
  const halfWidth = openingWidth * 0.5;
  const sideWidth = 13 - halfWidth;
  const sideY = wallHeight * 0.5;
  [-1, 1].forEach((side) => {
    box(group, { x: sideWidth, y: wallHeight, z: 0.28 }, {
      x: side * (halfWidth + sideWidth * 0.5),
      y: sideY,
      z
    }, surface, `${id}:${side < 0 ? 'port' : 'starboard'}`);
  });
  box(group, { x: openingWidth, y: 0.72, z: 0.28 }, { x: 0, y: 0.36, z }, surface, `${id}:sill`);
  box(group, { x: openingWidth, y: 0.46, z: 0.28 }, { x: 0, y: 3.19, z }, surface, `${id}:header`);
  colliders.push(colliderForBox(0, z, 26, 0.28, 0, wallHeight, id));
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
  const screen = shipDisplayMaterial(label, accent);
  box(consoleGroup, { x: 2.55, y: 0.16, z: 0.92 }, { x: 0, y: 0.08, z: 0 }, frame, `${label}:console-plinth`);
  box(consoleGroup, { x: 2.3, y: 0.66, z: 0.72 }, { x: 0, y: 0.45, z: 0 }, dark, `${label}:console-body`);
  [-1.08, 1.08].forEach((side) => box(consoleGroup, { x: 0.18, y: 0.82, z: 0.82 }, { x: side, y: 0.48, z: 0 }, frame, `${label}:console-edge`));
  const bezel = box(consoleGroup, { x: 2.28, y: 0.72, z: 0.12 }, { x: 0, y: 1.01, z: -0.3 }, frame, `${label}:display-bezel`);
  bezel.rotation.x = -0.32;
  const display = box(consoleGroup, { x: 2.04, y: 0.54, z: 0.035 }, { x: 0, y: 1.02, z: -0.372 }, screen, `${label}:display`);
  display.rotation.x = -0.32;
  display.userData.shipAnimated = 'screen';
  display.userData.baseEmissiveIntensity = 0.68 + (accent % 7) * 0.018;
  box(consoleGroup, { x: 1.74, y: 0.28, z: 0.035 }, { x: 0, y: 0.43, z: -0.375 }, material(0x273847, { metalness: 0.52, roughness: 0.4 }), `${label}:service-access`);
  [-0.62, -0.31, 0, 0.31, 0.62].forEach((offset) => box(consoleGroup, { x: 0.18, y: 0.04, z: 0.025 }, { x: offset, y: 0.43, z: -0.4 }, material(0x7c8d98, { metalness: 0.66, roughness: 0.32 }), `${label}:service-vent`));
  box(consoleGroup, { x: 1.8, y: 0.035, z: 0.06 }, { x: 0, y: 0.15, z: -0.42 }, material(accent, { emissive: accent, emissiveIntensity: 0.42, metalness: 0.08, roughness: 0.3 }), `${label}:console-underglow`);
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
  const display = box(root, { x: 1.42, y: 0.7, z: 0.05 }, { x: -1.28, y: 1.56, z: 0.25 }, shipDisplayMaterial(label, accent, 0.76), `${label}:instrument-display`);
  display.userData.shipAnimated = 'screen';
  display.userData.baseEmissiveIntensity = 0.78;
  const scannerBed = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 24), material(0x263845, { metalness: 0.62, roughness: 0.32 }));
  scannerBed.rotation.x = Math.PI / 2;
  scannerBed.position.set(0.65, 1.18, -0.04);
  scannerBed.name = `${label}:sample-scanner-bed`;
  root.add(scannerBed);
  const scannerRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 10, 28), material(accent, { emissive: accent, emissiveIntensity: 0.48, metalness: 0.32, roughness: 0.28 }));
  scannerRing.rotation.x = Math.PI / 2;
  scannerRing.position.set(0.65, 1.38, -0.04);
  scannerRing.name = `${label}:sample-scanner-ring`;
  root.add(scannerRing);
  box(root, { x: 0.1, y: 0.88, z: 0.1 }, { x: 1.28, y: 1.48, z: -0.02 }, frame, `${label}:scanner-arm`);
  box(root, { x: 0.72, y: 0.1, z: 0.1 }, { x: 0.96, y: 1.9, z: -0.02 }, frame, `${label}:scanner-boom`);
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

function addRoomTaskLight(group, x, z, color, label, intensity = 0.7, distance = 10) {
  const fixture = box(group, { x: 2.4, y: 0.08, z: 0.65 }, { x, y: 3.14, z }, material(color, { emissive: color, emissiveIntensity: 0.82, metalness: 0.08, roughness: 0.26 }), `${label}:ceiling-task-light`);
  fixture.userData.shipAnimated = 'screen';
  fixture.userData.baseEmissiveIntensity = 0.74;
  const light = new THREE.PointLight(color, intensity, distance, 1.7);
  light.position.set(x, 2.82, z);
  light.name = `${label}:task-light-source`;
  group.add(light);
}

function addMedicalBed(group, x, z, yaw, accent, label) {
  const root = new THREE.Group();
  root.name = `medical-bed:${label}`;
  const frame = material(0x667989, { metalness: 0.48, roughness: 0.38 });
  const cushion = material(0xd5e0e4, { metalness: 0.03, roughness: 0.86 });
  const screenSurface = shipDisplayMaterial(`${label}-vitals`, accent, 0.78);
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
  box(root, { x: 1.35, y: 0.1, z: 0.1 }, { x: 0.7, y: 2.1, z: 0.82 }, frame, `${label}:diagnostic-boom`);
  const diagnosticLamp = cylinder(root, 0.32, 0.24, 0.12, { x: 0.08, y: 2.04, z: 0.82 }, material(0xccecf0, { emissive: 0xa9e4ea, emissiveIntensity: 0.8, metalness: 0.12, roughness: 0.24 }), `${label}:diagnostic-lamp`, { x: Math.PI / 2, y: 0, z: 0 }, 18);
  diagnosticLamp.userData.shipAnimated = 'screen';
  diagnosticLamp.userData.baseEmissiveIntensity = 0.74;
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
    const panelAccent = index === 1 ? 0xe2a34b : accent;
    const panel = box(root, { x: 1.1, y: 0.34, z: 0.045 }, { x: offset, y: 1.72, z: 0.51 }, shipDisplayMaterial(`galley-${index + 1}`, panelAccent, 0.62), `galley-display:${index}`);
    panel.userData.shipAnimated = 'screen';
    panel.userData.baseEmissiveIntensity = 0.56;
    box(root, { x: 0.62, y: 0.05, z: 0.08 }, { x: offset, y: 0.5, z: -0.86 }, frame, `galley-handle:${index}`);
  });
  [0, 0.52, 1.04].forEach((offset) => cylinder(root, 0.11, 0.1, 0.28, { x: 2.25 + offset, y: 1.24, z: -0.15 }, material(0x96c3d0, { metalness: 0.06, roughness: 0.38 }), 'galley-container'));
  const sink = cylinder(root, 0.62, 0.62, 0.08, { x: -2.3, y: 1.12, z: -0.05 }, dark, 'galley-sink', null, 24);
  sink.scale.z = 0.65;
  const tap = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 8, 18, Math.PI), frame);
  tap.rotation.x = Math.PI / 2;
  tap.position.set(-2.3, 1.35, 0.06);
  tap.name = 'galley-water-tap';
  root.add(tap);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  group.add(root);
  return root;
}

function addWardroomTable(group, x, z, accent) {
  const root = new THREE.Group();
  root.name = 'wardroom-furniture';
  const frame = material(0x596c79, { metalness: 0.56, roughness: 0.36 });
  const top = material(0x3a302d, { metalness: 0.12, roughness: 0.62 });
  const fabric = material(0x29495b, { metalness: 0.02, roughness: 0.82 });
  const ceramic = material(0xd7e2e4, { metalness: 0.02, roughness: 0.52 });
  box(root, { x: 7.2, y: 0.18, z: 2.6 }, { x: 0, y: 0.92, z: 0 }, top, 'wardroom-tabletop');
  box(root, { x: 5.9, y: 0.025, z: 0.22 }, { x: 0, y: 1.02, z: 0 }, material(accent, { emissive: accent, emissiveIntensity: 0.38, metalness: 0.06, roughness: 0.28 }), 'wardroom-table-status-strip');
  [-2.7, 2.7].forEach((leg) => {
    box(root, { x: 0.28, y: 0.86, z: 1.8 }, { x: leg, y: 0.43, z: 0 }, frame, 'wardroom-table-leg');
    box(root, { x: 1.15, y: 0.14, z: 1.55 }, { x: leg, y: 0.12, z: 0 }, frame, 'wardroom-table-foot');
  });
  [-2.45, -0.85, 0.85, 2.45].forEach((placeX, index) => {
    const placeZ = index % 2 ? -0.68 : 0.68;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 24), ceramic);
    plate.position.set(placeX, 1.04, placeZ);
    plate.name = `wardroom-place-setting:${index}`;
    root.add(plate);
    cylinder(root, 0.09, 0.08, 0.24, { x: placeX + 0.45, y: 1.15, z: placeZ }, material(index % 2 ? 0x6faab9 : 0xc79b5a, { metalness: 0.04, roughness: 0.46 }), `wardroom-cup:${index}`, null, 14);
    box(root, { x: 0.06, y: 0.025, z: 0.52 }, { x: placeX - 0.48, y: 1.05, z: placeZ }, frame, `wardroom-utensil:${index}`);
  });
  [-4.1, -1.35, 1.35, 4.1].forEach((seatX, index) => {
    const seatZ = index % 2 ? -1.85 : 1.85;
    box(root, { x: 1.05, y: 0.18, z: 0.78 }, { x: seatX, y: 0.55, z: seatZ }, fabric, 'wardroom-seat');
    box(root, { x: 1.05, y: 0.7, z: 0.14 }, { x: seatX, y: 0.9, z: seatZ + (seatZ < 0 ? -0.38 : 0.38) }, fabric, 'wardroom-seat-back');
    cylinder(root, 0.12, 0.2, 0.42, { x: seatX, y: 0.25, z: seatZ }, frame, 'wardroom-seat-pedestal', null, 12);
  });
  root.position.set(x, 0, z);
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
      const plantMaterial = material(index % 3 === 0 ? 0x73ad5f : 0x4c8f58, { roughness: 0.94, metalness: 0 });
      cylinder(root, 0.025, 0.035, 0.34, { x: offset, y: height + 0.28, z: index % 2 ? 0.23 : -0.2 }, material(0x477447, { roughness: 0.92, metalness: 0 }), `${label}:plant-stem`);
      [-0.11, 0.11].forEach((leafOffset, leafIndex) => {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (index % 2) * 0.035, 10, 7), plantMaterial);
        leaf.scale.set(1.5, 0.34, 0.75);
        leaf.rotation.z = leafOffset < 0 ? -0.42 : 0.42;
        leaf.position.set(offset + leafOffset, height + 0.38 + leafIndex * 0.08, (index % 2 ? 0.23 : -0.2));
        leaf.name = `${label}:plant-leaf`;
        root.add(leaf);
      });
    });
  });
  box(root, { x: 0.18, y: 2.34, z: 0.18 }, { x: -1.48, y: 1.35, z: 0.72 }, material(0x5aaeb5, { emissive: 0x1c5960, emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.3 }), `${label}:nutrient-line`);
  const monitor = box(root, { x: 0.92, y: 0.58, z: 0.045 }, { x: 1.14, y: 2.45, z: -0.77 }, shipDisplayMaterial(`${label}-growth`, accent, 0.68), `${label}:growth-monitor`);
  monitor.userData.shipAnimated = 'screen';
  monitor.userData.baseEmissiveIntensity = 0.64;
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

function addFabricationWorkbench(group, x, z, accent) {
  const root = new THREE.Group();
  root.name = 'fabrication-workbench-system';
  const frame = material(0x596976, { metalness: 0.62, roughness: 0.34 });
  const dark = material(0x16232d, { metalness: 0.48, roughness: 0.44 });
  const copper = material(0xb5754f, { metalness: 0.58, roughness: 0.3 });
  box(root, { x: 4.7, y: 0.18, z: 1.55 }, { x: 0, y: 0.92, z: 0 }, frame, 'fabrication-workbench');
  [-1.75, 1.75].forEach((side) => box(root, { x: 0.86, y: 0.82, z: 1.25 }, { x: side, y: 0.42, z: 0 }, dark, 'fabrication-drawer-bank'));
  [-0.22, 0.02, 0.26].forEach((height) => [-1.75, 1.75].forEach((side) => box(root, { x: 0.56, y: 0.04, z: 0.05 }, { x: side, y: 0.44 + height, z: -0.65 }, frame, 'fabrication-drawer-handle')));
  [-2.05, 2.05].forEach((side) => box(root, { x: 0.16, y: 1.45, z: 0.18 }, { x: side, y: 1.65, z: 0.48 }, frame, 'fabrication-gantry-post'));
  box(root, { x: 4.25, y: 0.16, z: 0.18 }, { x: 0, y: 2.35, z: 0.48 }, frame, 'fabrication-gantry-rail');
  box(root, { x: 0.5, y: 0.42, z: 0.5 }, { x: 0.4, y: 2.15, z: 0.48 }, dark, 'fabrication-tool-head');
  cylinder(root, 0.07, 0.12, 0.58, { x: 0.4, y: 1.67, z: 0.48 }, copper, 'fabrication-tool-nozzle', null, 12);
  box(root, { x: 1.3, y: 0.06, z: 0.92 }, { x: 0.4, y: 1.05, z: 0.08 }, material(0x273842, { metalness: 0.7, roughness: 0.26 }), 'fabrication-build-plate');
  const monitor = box(root, { x: 1.15, y: 0.66, z: 0.045 }, { x: -1.1, y: 1.68, z: -0.7 }, shipDisplayMaterial('fabrication-queue', accent, 0.72), 'fabrication-queue-display');
  monitor.userData.shipAnimated = 'screen';
  monitor.userData.baseEmissiveIntensity = 0.68;
  [-1.25, 0, 1.25].forEach((offset, index) => cylinder(root, 0.2, 0.24, 0.62, { x: offset, y: 1.32, z: -0.05 }, material(index === 1 ? accent : 0x81919a, { emissive: index === 1 ? 0x6d3c13 : 0x000000, emissiveIntensity: index === 1 ? 0.3 : 0 }), 'fabrication-feedstock'));
  root.position.set(x, 0, z);
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
    addRoomTaskLight(group, 0, 29.2, 0x9fe8f3, 'bridge', 0.72, 11);
    addRoomTaskLight(group, -8.2, -1.4, 0x79c7e5, 'physical-science', 0.62, 8);
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
  } else if (deckId === 'habitat') {
    addRoomTaskLight(group, 1.5, 30, 0xffd5a4, 'wardroom', 0.74, 12);
    addRoomTaskLight(group, -8.2, 15.5, 0xc7f0f2, 'medical', 0.68, 9);
    addRoomTaskLight(group, -8.2, -29, 0xa7efba, 'hydroponics', 0.64, 10);
    addGalleyModule(group, -7.6, 26.1, 0, 0x5fd6a3);
    addWardroomTable(group, 1.5, 30.2, 0x5fd6a3);
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
    addRoomTaskLight(group, 0, 30, 0xffbd82, 'main-engineering', 0.76, 12);
    addRoomTaskLight(group, -8.2, -2.4, 0xffc58f, 'fabrication', 0.66, 9);
    addRoomTaskLight(group, 0, -29, 0x8ecfe8, 'local-craft-bay', 0.7, 12);
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
    [-1.35, -0.45, 0.45, 1.35].forEach((x, index) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), material(index % 2 ? 0xffb272 : 0x76d8ea, { emissive: index % 2 ? 0xff7d3b : 0x3fb4cf, emissiveIntensity: 0.9, metalness: 0.12, roughness: 0.24 }));
      node.position.set(x, 0, -2.93);
      node.name = `propulsion-core-field-node:${index}`;
      node.userData.shipAnimated = 'screen';
      node.userData.baseEmissiveIntensity = 0.82;
      coreRoot.add(node);
    });
    [-1.65, 1.65].forEach((x) => {
      cylinder(coreRoot, 0.085, 0.085, 5.1, { x, y: -1.25, z: 0 }, material(0xa66a45, { metalness: 0.66, roughness: 0.3 }), 'propulsion-core-service-conduit', { x: Math.PI / 2, y: 0, z: 0 }, 10);
      [-2.45, 2.45].forEach((z) => cylinder(coreRoot, 0.18, 0.18, 0.26, { x, y: -1.25, z }, material(0x314652, { metalness: 0.7, roughness: 0.28 }), 'propulsion-core-conduit-coupling', { x: Math.PI / 2, y: 0, z: 0 }, 12));
    });
    coreRoot.position.set(0, 1.82, 30.5);
    group.add(coreRoot);
    addConsole(group, -4.5, 31.2, Math.PI, 0xe28d4c, 'propulsion-control');
    addConsole(group, 4.5, 31.2, Math.PI, 0xe2b34c, 'engineering-watch');
    [-9.7, -6.9].forEach((x, index) => addPowerCabinet(group, x, 15.5, Math.PI / 2, 0xe2b34c, `power-${index + 1}`));
    addWallServicePanel(group, -12.55, 19, Math.PI / 2, 0xe2b34c, 'power-bus-service');
    addThermalAssembly(group, 8.2, 12.4, 0, 0x55b9d7, 'coolant-a');
    addThermalAssembly(group, 8.2, 18.7, Math.PI, 0x55b9d7, 'coolant-b');
    addConsole(group, -8, 0.5, Math.PI / 2, 0xdfa14a, 'fabricator');
    addFabricationWorkbench(group, -8.2, -3.7, 0xdfa14a);
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
    shuttle.name = 'expedition-landing-pod';
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
    box(shuttle, { x: 0.18, y: 1.45, z: 2.35 }, { x: 0, y: 0.62, z: -3.15 }, steel, 'survey-craft-tail-fin');
    [-2.3, 2.3].forEach((side) => box(shuttle, { x: 2.3, y: 0.12, z: 1.25 }, { x: side, y: 0.16, z: -2.8 }, steel, 'survey-craft-tailplane'));
    [-3.2, 3.2].forEach((side) => cylinder(shuttle, 0.44, 0.62, 2.8, { x: side, y: -0.12, z: -0.4 }, dark, 'survey-craft-thruster', { x: Math.PI / 2, y: 0, z: 0 }, 16));
    [-3.2, 3.2].forEach((side) => {
      const engineRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 10, 22), material(0x607685, { metalness: 0.74, roughness: 0.26 }));
      engineRing.position.set(side, -0.12, -1.8);
      engineRing.name = 'survey-craft-engine-ring';
      shuttle.add(engineRing);
      const exhaust = cylinder(shuttle, 0.34, 0.34, 0.08, { x: side, y: -0.12, z: -1.86 }, material(0x61c9e4, { emissive: 0x2e9fc2, emissiveIntensity: 0.72, metalness: 0.06, roughness: 0.24 }), 'survey-craft-engine-glow', { x: Math.PI / 2, y: 0, z: 0 }, 18);
      exhaust.userData.shipAnimated = 'screen';
      exhaust.userData.baseEmissiveIntensity = 0.66;
    });
    [-0.56, 0.56].forEach((side) => box(shuttle, { x: 0.08, y: 0.75, z: 1.42 }, { x: side, y: 1.1, z: 0.92 }, material(0x7895a3, { metalness: 0.56, roughness: 0.3 }), 'survey-craft-canopy-frame'));
    [-2.45, 0, 2.45].forEach((side, index) => {
      box(shuttle, { x: 0.18, y: 1.1, z: 0.18 }, { x: side, y: -0.68, z: index === 1 ? 1.9 : -0.55 }, dark, 'survey-craft-landing-strut');
      cylinder(shuttle, 0.27, 0.27, 0.18, { x: side, y: -1.24, z: index === 1 ? 1.9 : -0.55 }, material(0x17212b, { metalness: 0.25, roughness: 0.72 }), 'survey-craft-landing-pad', null, 16);
    });
    [-0.56, 0.56].forEach((side) => box(shuttle, { x: 0.12, y: 0.12, z: 2.1 }, { x: side, y: 0.55, z: -3.5 }, material(0xdfa14a, { emissive: 0xdfa14a, emissiveIntensity: 0.62 }), 'survey-craft-marker'));
    const hatchSurface = material(0x203746, { metalness: 0.58, roughness: 0.3 });
    box(shuttle, { x: 0.09, y: 1.35, z: 1.18 }, { x: 1.62, y: 0.62, z: 1.12 }, hatchSurface, 'survey-craft-boarding-hatch');
    [-0.62, 0.62].forEach((offset) => box(shuttle, { x: 0.12, y: 1.55, z: 0.12 }, { x: 1.7, y: 0.62, z: 1.12 + offset }, steel, 'survey-craft-hatch-frame'));
    box(shuttle, { x: 0.12, y: 0.12, z: 1.42 }, { x: 1.7, y: 1.38, z: 1.12 }, steel, 'survey-craft-hatch-header');
    box(shuttle, { x: 0.12, y: 0.16, z: 0.42 }, { x: 1.74, y: 0.72, z: 1.12 }, material(0x67d8e8, { emissive: 0x2a9eb5, emissiveIntensity: 0.72, metalness: 0.12, roughness: 0.24 }), 'survey-craft-hatch-control');
    const boardingRamp = box(shuttle, { x: 2.75, y: 0.12, z: 1.22 }, { x: 2.9, y: -0.58, z: 1.12 }, material(0x566a77, { metalness: 0.62, roughness: 0.32 }), 'survey-craft-boarding-ramp');
    boardingRamp.rotation.z = -0.16;
    shuttle.position.set(0, 1.45, -29.5);
    group.add(shuttle);
    [-3.35, 3.35].forEach((side) => {
      box(group, { x: 0.34, y: 0.3, z: 9.4 }, { x: side, y: 0.18, z: -29.5 }, dark, 'pod-launch-rail');
      [-33.2, -25.8].forEach((z) => box(group, { x: 0.62, y: 0.72, z: 0.5 }, { x: side, y: 0.38, z }, steel, 'pod-magnetic-clamp'));
    });
    box(group, { x: 9.6, y: 0.1, z: 0.4 }, { x: 0, y: 0.08, z: -34.15 }, material(0x64c9e4, { emissive: 0x2e9fc2, emissiveIntensity: 0.54, metalness: 0.08, roughness: 0.28 }), 'pod-launch-threshold');
    [-4.8, 4.8].forEach((side) => box(group, { x: 0.28, y: 3.1, z: 0.3 }, { x: side, y: 1.55, z: -34.45 }, steel, 'pod-bay-door-frame'));
    box(group, { x: 9.9, y: 0.28, z: 0.3 }, { x: 0, y: 3.02, z: -34.45 }, steel, 'pod-bay-door-header');
    const podStatus = box(group, { x: 1.4, y: 0.7, z: 0.045 }, { x: 5.35, y: 1.55, z: -29 }, shipDisplayMaterial('pod-launch-ready', 0xdfa14a, 0.74), 'pod-launch-status-display');
    podStatus.rotation.y = -Math.PI / 2;
    podStatus.userData.shipAnimated = 'screen';
    podStatus.userData.baseEmissiveIntensity = 0.7;
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
  const sourceCanvas = appCtx.spaceFlight?.canvas;
  const texture = sourceCanvas ? new THREE.CanvasTexture(sourceCanvas) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  }
  const viewSurface = texture
    ? new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, toneMapped: false })
    : new THREE.MeshBasicMaterial({ color: 0x020713, toneMapped: false });
  const bridgeView = box(group, { x: 18, y: 2.2, z: 0.055 }, { x: 0, y: 1.82, z: 35.79 }, viewSurface, 'bridge-forward-local-space-view');
  const observationView = box(group, { x: 22.4, y: 2.62, z: 0.055 }, { x: 0, y: 1.78, z: -35.79 }, viewSurface, 'observation-gallery-local-space-view');
  const frame = material(0x526b7b, { metalness: 0.72, roughness: 0.24 });
  [-9.15, -4.55, 0, 4.55, 9.15].forEach((x) => {
    box(group, { x: 0.18, y: 2.74, z: 0.22 }, { x, y: 1.8, z: -35.66 }, frame, 'observation-gallery-window-mullion');
  });
  box(group, { x: 22.8, y: 0.18, z: 0.28 }, { x: 0, y: 0.68, z: -35.65 }, frame, 'observation-gallery-window-sill');
  box(group, { x: 22.8, y: 0.2, z: 0.28 }, { x: 0, y: 3.12, z: -35.65 }, frame, 'observation-gallery-window-header');
  const portalCamera = appCtx.spaceFlight?.camera?.clone?.() || null;
  if (portalCamera) {
    portalCamera.fov = 64;
    portalCamera.aspect = 18 / 7;
    portalCamera.near = 0.5;
    portalCamera.far = appCtx.spaceFlight.camera.far;
    portalCamera.updateProjectionMatrix();
  }
  return {
    source: texture ? 'live-local-space-renderer' : 'unavailable',
    texture,
    camera: portalCamera,
    surfaces: [bridgeView, observationView],
    elapsed: 0,
    frameCount: 0
  };
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
  const roomDirection = door.orientation === 'side'
    ? { x: room.side === 'port' ? -1 : 1, z: 0 }
    : { x: 0, z: room.minZ >= 23 ? 1 : -1 };
  const signs = [
    { suffix: 'room', direction: roomDirection },
    { suffix: 'corridor', direction: { x: -roomDirection.x, z: -roomDirection.z } }
  ];
  signs.forEach(({ suffix, direction }) => {
    const labelSurface = new THREE.MeshBasicMaterial({
      map: roomLabelTexture(room.label, accentColor),
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 0.58), labelSurface);
    label.name = `room-sign:${room.id}:${suffix}`;
    label.position.set(door.x + direction.x * 0.195, 2.75, door.z + direction.z * 0.195);
    label.rotation.y = Math.atan2(direction.x, direction.z);
    group.add(label);
  });
}

function addDeckSurfaceDetails(group, deckDefinition, accentColor) {
  const trim = material(0x3b4c59, { metalness: 0.7, roughness: 0.3 });
  const dark = material(0x111b24, { metalness: 0.52, roughness: 0.48 });
  const accent = material(accentColor, { emissive: accentColor, emissiveIntensity: 0.5, metalness: 0.16, roughness: 0.34 });
  const deckPlate = material(
    deckDefinition.id === 'command' ? 0x283b4b : deckDefinition.id === 'habitat' ? 0x2d403a : 0x43352d,
    { metalness: 0.38, roughness: 0.5 }
  );

  [-2.64, 2.64].forEach((x) => {
    box(group, { x: 0.13, y: 0.22, z: 70.2 }, { x, y: 0.12, z: 0 }, trim, `corridor-kick-rail:${deckDefinition.id}`);
    box(group, { x: 0.1, y: 0.12, z: 70.2 }, { x, y: 2.57, z: 0 }, dark, `corridor-service-rail:${deckDefinition.id}`);
  });
  [-12.76, 12.76].forEach((x) => {
    box(group, { x: 0.11, y: 0.34, z: 70.2 }, { x, y: 0.18, z: 0 }, trim, `hull-kick-rail:${deckDefinition.id}`);
    box(group, { x: 0.09, y: 0.11, z: 70.2 }, { x, y: 2.62, z: 0 }, dark, `hull-service-rail:${deckDefinition.id}`);
  });

  [-32, -24, -16, -8, 0, 8, 16, 24, 32].forEach((z) => {
    box(group, { x: 25.55, y: 0.16, z: 0.24 }, { x: 0, y: 3.28, z }, trim, `ceiling-crossbeam:${deckDefinition.id}`);
    [-10.8, -2.45, 2.45, 10.8].forEach((x) => {
      box(group, { x: 0.2, y: 0.16, z: 0.58 }, { x, y: 3.19, z }, dark, `ceiling-hardpoint:${deckDefinition.id}`);
    });
  });
  [-1.36, 1.36].forEach((x) => {
    box(group, { x: 0.18, y: 0.11, z: 69.5 }, { x, y: 3.34, z: 0 }, trim, `ceiling-service-spine:${deckDefinition.id}`);
  });

  deckDefinition.rooms.forEach((room, roomIndex) => {
    const centerX = (room.minX + room.maxX) * 0.5;
    const centerZ = (room.minZ + room.maxZ) * 0.5;
    const plateWidth = room.side === 'full' ? Math.min(14, room.maxX - room.minX - 2) : Math.min(6.6, room.maxX - room.minX - 1.4);
    const plateDepth = Math.min(5.2, room.maxZ - room.minZ - 1.5);
    box(group, { x: plateWidth, y: 0.028, z: plateDepth }, { x: centerX, y: 0.022, z: centerZ }, deckPlate, `floor-access-panel:${room.id}`);
    const frameY = 0.041;
    box(group, { x: plateWidth + 0.16, y: 0.025, z: 0.07 }, { x: centerX, y: frameY, z: centerZ - plateDepth * 0.5 }, roomIndex % 3 === 0 ? accent : trim, `floor-panel-frame:${room.id}`);
    box(group, { x: plateWidth + 0.16, y: 0.025, z: 0.07 }, { x: centerX, y: frameY, z: centerZ + plateDepth * 0.5 }, roomIndex % 3 === 0 ? accent : trim, `floor-panel-frame:${room.id}`);
    box(group, { x: 0.07, y: 0.025, z: plateDepth }, { x: centerX - plateWidth * 0.5, y: frameY, z: centerZ }, trim, `floor-panel-frame:${room.id}`);
    box(group, { x: 0.07, y: 0.025, z: plateDepth }, { x: centerX + plateWidth * 0.5, y: frameY, z: centerZ }, trim, `floor-panel-frame:${room.id}`);

    if (room.side !== 'full') {
      const outerX = room.side === 'port' ? -12.79 : 12.79;
      [room.minZ + 0.65, room.maxZ - 0.65].forEach((z) => {
        box(group, { x: 0.1, y: 2.82, z: 0.2 }, { x: outerX, y: 1.48, z }, trim, `room-wall-frame:${room.id}`);
      });
    }
  });

  SHIP_DOORS.filter((door) => door.deckId === deckDefinition.id).forEach((door) => {
    const thresholdSize = door.orientation === 'side'
      ? { x: 0.72, y: 0.045, z: 2.05 }
      : { x: 2.05, y: 0.045, z: 0.72 };
    box(group, thresholdSize, { x: door.x, y: 0.055, z: door.z }, dark, `door-threshold:${door.id}`);
    const insetSize = door.orientation === 'side'
      ? { x: 0.74, y: 0.02, z: 0.1 }
      : { x: 0.1, y: 0.02, z: 0.74 };
    box(group, insetSize, { x: door.x, y: 0.083, z: door.z }, accent, `door-threshold-signal:${door.id}`);
  });
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
  addDeckSurfaceDetails(group, deckDefinition, accentColor);
}

function buildDeckScene(deckDefinition) {
  const group = new THREE.Group();
  group.name = `surveyor-deck:${deckDefinition.id}`;
  const colliders = [];
  const doorStates = [];
  const deckSurface = shipSurfaceMaterial('floor', deckDefinition.id);
  const wallSurface = shipSurfaceMaterial('wall', deckDefinition.id);
  const ceiling = shipSurfaceMaterial('ceiling', deckDefinition.id);
  const corridor = shipSurfaceMaterial('corridor', deckDefinition.id);
  const accentColor = deckAccent(deckDefinition.id);
  const accent = material(accentColor, { emissive: accentColor, emissiveIntensity: 0.38, roughness: 0.4 });

  box(group, { x: 26, y: 0.18, z: 72 }, { x: 0, y: -0.08, z: 0 }, deckSurface, `${deckDefinition.id}:deck`);
  box(group, { x: 4.9, y: 0.04, z: 69.5 }, { x: 0, y: 0.03, z: 0 }, corridor, `${deckDefinition.id}:corridor`);
  box(group, { x: 26, y: 0.16, z: 72 }, { x: 0, y: 3.48, z: 0 }, ceiling, `${deckDefinition.id}:ceiling`);
  wall(group, colliders, { x: -13, z: -36 }, { x: -13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-port`);
  wall(group, colliders, { x: 13, z: -36 }, { x: 13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-starboard`);
  if (deckDefinition.id === 'command') {
    hullWallWithViewport(group, colliders, -36, 23, wallSurface, `${deckDefinition.id}:hull-aft`);
    hullWallWithViewport(group, colliders, 36, 18.6, wallSurface, `${deckDefinition.id}:hull-forward`);
  } else {
    wall(group, colliders, { x: -13, z: -36 }, { x: 13, z: -36 }, wallSurface, `${deckDefinition.id}:hull-aft`);
    wall(group, colliders, { x: -13, z: 36 }, { x: 13, z: 36 }, wallSurface, `${deckDefinition.id}:hull-forward`);
  }
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
  const spaceView = deckDefinition.id === 'command' ? addBridgeView(group) : null;
  addDeckPropColliders(colliders, deckDefinition.id);
  group.add(new THREE.HemisphereLight(0xcde7ff, 0x101923, 0.5));
  const fill = new THREE.DirectionalLight(0xdceaf3, 0.68);
  fill.position.set(8, 18, 8);
  group.add(fill);
  [-30, -20, -10, 0, 10, 20, 30].forEach((z, index) => {
    const light = new THREE.PointLight(deckDefinition.id === 'engineering' ? 0xffc49a : deckDefinition.id === 'habitat' ? 0xd9ffe9 : 0xbde9ff, 0.92, 17, 2);
    light.position.set(index % 2 ? -1.1 : 1.1, 3.12, z);
    group.add(light);
  });
  const alertLight = new THREE.PointLight(0xff6b45, 0, 30, 2);
  alertLight.position.set(0, 3.1, 0);
  alertLight.name = `ship-alert-light:${deckDefinition.id}`;
  group.add(alertLight);
  return { group, colliders, doorStates, alertLight, spaceView };
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
  const visualContract = {
    texturedSurfaceCount: 0,
    floorAccessPanelCount: 0,
    ceilingCrossbeamCount: 0,
    doorThresholdCount: 0,
    consoleDisplayCount: 0,
    equipmentGroupCount: 0
  };
  const equipmentPrefixes = ['ship-console:', 'science-bench:', 'service-panel:', 'medical-bed:', 'crew-bunk:', 'life-support:', 'hydroponics:', 'power-cabinet:', 'thermal-assembly:', 'cargo-module:', 'eva-suit:', 'expedition-landing-pod'];
  root.traverse((child) => {
    if (child.material?.map) visualContract.texturedSurfaceCount += 1;
    if (child.name?.startsWith('floor-access-panel:')) visualContract.floorAccessPanelCount += 1;
    if (child.name?.startsWith('ceiling-crossbeam:')) visualContract.ceilingCrossbeamCount += 1;
    if (child.name?.startsWith('door-threshold:')) visualContract.doorThresholdCount += 1;
    if (child.name?.endsWith(':display') && child.parent?.name?.startsWith('ship-console:')) visualContract.consoleDisplayCount += 1;
    if (equipmentPrefixes.some((prefix) => child.name?.startsWith(prefix))) visualContract.equipmentGroupCount += 1;
  });
  return {
    root,
    deckStates,
    crewMeshes,
    crewLayer,
    animatedParts,
    spaceView: deckStates.get('command')?.spaceView || null,
    visualContract: Object.freeze(visualContract),
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

function disposePresentation(group) {
  group?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const disposeSurface = (surface) => {
      surface?.map?.dispose?.();
      surface?.emissiveMap?.dispose?.();
      surface?.bumpMap?.dispose?.();
      surface?.dispose?.();
    };
    if (Array.isArray(child.material)) child.material.forEach(disposeSurface);
    else disposeSurface(child.material);
  });
  group?.parent?.remove?.(group);
}

function clearIncidentPresentation(session) {
  if (!session) return;
  if (session.incidentPresentation?.group) disposePresentation(session.incidentPresentation.group);
  session.incidentPresentation = null;
  session.incidentProcedure = null;
  document.getElementById('shipObjectiveCue')?.classList.remove('show');
}

function refreshIncidentProcedureVisuals(session) {
  const presentation = session?.incidentPresentation;
  if (!presentation) return false;
  const procedure = session.incidentProcedure;
  presentation.nodes.forEach((node, index) => {
    const complete = procedure && index < procedure.stepIndex;
    const active = procedure && index === procedure.stepIndex && !procedure.completing;
    const color = complete ? 0x6ee7a8 : active ? 0x6fe8ff : 0xff9f43;
    node.indicator.material.color.setHex(color);
    node.indicator.material.emissive.setHex(color);
    node.indicator.material.emissiveIntensity = active ? 2.4 : complete ? 1.05 : 0.42;
    node.root.scale.setScalar(active ? 1.12 : 1);
  });
  const cue = document.getElementById('shipObjectiveCue');
  if (!cue || !procedure) return true;
  const current = procedure.steps[Math.min(procedure.stepIndex, procedure.steps.length - 1)];
  cue.innerHTML = `<span>SHIP RESPONSE · ${Math.min(procedure.stepIndex + 1, procedure.steps.length)} OF ${procedure.steps.length}</span><strong>${procedure.completing ? 'Crew verification in progress' : current.label}</strong><small>${presentation.deckLabel} · ${presentation.roomLabel}</small><button type="button">Show route</button>`;
  cue.querySelector('button')?.addEventListener('click', () => {
    session.mapDeckId = presentation.deckId;
    toggleShipMap(true);
  });
  return true;
}

function startIncidentProcedure(details = {}) {
  const session = activeSession;
  const pending = session?.expedition?.pendingEvent;
  if (!session || !pending || pending.id !== details.eventId || !session.incidentPresentation) return false;
  if (session.incidentProcedure?.eventId === pending.id) return true;
  session.incidentProcedure = {
    eventId: pending.id,
    choiceId: String(details.choiceId || ''),
    choiceLabel: String(details.choiceLabel || 'Complete ship response'),
    steps: procedureStepsFor(pending),
    stepIndex: 0,
    completing: false,
    complete: typeof details.complete === 'function' ? details.complete : null
  };
  document.getElementById('shipStationPanel')?.classList.remove('show');
  refreshIncidentProcedureVisuals(session);
  updateActiveDeckContract(session);
  appCtx.showToast?.(`Begin ship response: ${session.incidentProcedure.steps[0].label}.`);
  playShipTone('operation');
  return true;
}

async function advanceIncidentProcedure(interaction) {
  const session = activeSession;
  const procedure = session?.incidentProcedure;
  const presentation = session?.incidentPresentation;
  if (!procedure || !presentation || procedure.completing) return false;
  const expected = `incident-step:${procedure.eventId}:${procedure.stepIndex}`;
  if (interaction?.id !== expected) return false;
  procedure.stepIndex += 1;
  playShipTone('operation');
  if (procedure.stepIndex < procedure.steps.length) {
    refreshIncidentProcedureVisuals(session);
    updateActiveDeckContract(session);
    appCtx.showToast?.(procedure.steps[procedure.stepIndex].label);
    return true;
  }
  procedure.completing = true;
  refreshIncidentProcedureVisuals(session);
  updateActiveDeckContract(session);
  const completed = await procedure.complete?.();
  if (completed === false && activeSession === session && session.expedition?.pendingEvent?.id === procedure.eventId) {
    procedure.completing = false;
    procedure.stepIndex = Math.max(0, procedure.steps.length - 1);
    refreshIncidentProcedureVisuals(session);
    updateActiveDeckContract(session);
    return false;
  }
  return true;
}

function syncIncidentPresentation(session) {
  if (!session) return false;
  const pending = session.expedition?.pendingEvent;
  if (!pending?.roomId) {
    clearIncidentPresentation(session);
    return false;
  }
  if (session.incidentPresentation?.eventId === pending.id) return true;
  clearIncidentPresentation(session);
  const room = SHIP_ROOMS.find((entry) => entry.id === pending.roomId);
  if (!room) return false;
  const deckState = session.sceneState.deckStates.get(room.deckId);
  if (!deckState) return false;
  const station = SHIP_STATIONS.find((entry) => entry.roomId === room.id);
  const x = Number(station?.x ?? ((room.minX + room.maxX) * 0.5));
  const z = Number(station?.z ?? ((room.minZ + room.maxZ) * 0.5));
  const palette = pending.kind === 'crew'
    ? { primary: 0xff6b86, secondary: 0xffd0d8 }
    : pending.kind === 'science'
      ? { primary: 0x66ddff, secondary: 0xc8f5ff }
      : { primary: 0xff9f43, secondary: 0xffe0a6 };
  const group = new THREE.Group();
  group.name = `ship-incident:${pending.id}`;
  group.position.set(x, 0, z);
  const ringSurface = material(palette.primary, { emissive: palette.primary, emissiveIntensity: 1.7, metalness: 0.08, roughness: 0.24 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.075, 10, 40), ringSurface);
  ring.name = 'incident-floor-beacon';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  const columnSurface = material(palette.primary, { emissive: palette.primary, emissiveIntensity: 0.9, metalness: 0, roughness: 0.5 });
  columnSurface.transparent = true;
  columnSurface.opacity = 0.12;
  columnSurface.depthWrite = false;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.72, 2.5, 18, 1, true), columnSurface);
  column.name = 'incident-guidance-column';
  column.position.y = 1.25;
  group.add(column);
  const particleSurface = material(palette.secondary, { emissive: palette.primary, emissiveIntensity: 1.6, metalness: 0.05, roughness: 0.28 });
  const particles = Array.from({ length: 8 }, (_, index) => {
    const particle = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (index % 3) * 0.012, 8, 6), particleSurface.clone());
    const angle = index * 2.399963229728653;
    particle.position.set(Math.cos(angle) * (0.28 + (index % 2) * 0.22), 0.25 + (index % 4) * 0.43, Math.sin(angle) * (0.28 + (index % 2) * 0.22));
    particle.userData.baseY = particle.position.y;
    particle.userData.phase = index * 0.71;
    group.add(particle);
    return particle;
  });
  particleSurface.dispose();
  const procedureSteps = procedureStepsFor(pending);
  const nodeOffsets = Object.freeze([Object.freeze({ x: 0.72, z: -0.7 }), Object.freeze({ x: 0, z: -0.9 }), Object.freeze({ x: -0.72, z: -0.7 })]);
  box(group, { x: 2.35, y: 0.18, z: 0.58 }, { x: 0, y: 0.12, z: -0.78 }, material(0x263947, { metalness: 0.72, roughness: 0.23 }), 'incident-service-console-base');
  box(group, { x: 2.12, y: 0.07, z: 0.12 }, { x: 0, y: 0.26, z: -0.58 }, material(palette.primary, { emissive: palette.primary, emissiveIntensity: 0.62, metalness: 0.2, roughness: 0.22 }), 'incident-service-console-light-rail');
  const conduit = cylinder(group, 0.055, 0.055, 1.7, { x: 0, y: 0.34, z: -0.98 }, material(0x8596a2, { metalness: 0.82, roughness: 0.18 }), 'incident-service-console-conduit', { x: 0, y: 0, z: Math.PI / 2 }, 12);
  conduit.castShadow = true;
  const nodes = procedureSteps.map((step, index) => {
    const offset = nodeOffsets[index];
    const root = new THREE.Group();
    root.name = `incident-action-node:${index}`;
    root.position.set(offset.x, 0, offset.z);
    box(root, { x: 0.58, y: 0.72, z: 0.46 }, { x: 0, y: 0.54, z: 0 }, material(0x4f626f, { metalness: 0.68, roughness: 0.24 }), 'incident-component-housing');
    box(root, { x: 0.51, y: 0.64, z: 0.025 }, { x: 0, y: 0.54, z: 0.243 }, material(0x263641, { metalness: 0.5, roughness: 0.3 }), 'incident-component-rear-panel');
    [-0.25, 0.25].forEach((side) => box(root, { x: 0.055, y: 0.78, z: 0.51 }, { x: side, y: 0.54, z: 0 }, material(0x82939e, { metalness: 0.82, roughness: 0.18 }), 'incident-component-edge-rail'));
    const screenTexture = createIncidentStepTexture(index, step.label, palette.primary);
    const screenSurface = material(0xffffff, { map: screenTexture, emissiveMap: screenTexture, emissive: 0xffffff, emissiveIntensity: 0.76, metalness: 0.04, roughness: 0.18 });
    const screen = box(root, { x: 0.43, y: 0.25, z: 0.028 }, { x: 0, y: 0.66, z: -0.246 }, screenSurface, 'incident-component-screen');
    const indicator = box(root, { x: 0.35, y: 0.075, z: 0.035 }, { x: 0, y: 0.33, z: -0.25 }, material(palette.primary, { emissive: palette.primary, emissiveIntensity: 0.42, metalness: 0.08, roughness: 0.18 }), 'incident-component-indicator');
    [-0.14, 0, 0.14].forEach((side, controlIndex) => cylinder(root, 0.038, 0.038, 0.045, { x: side, y: 0.22, z: -0.255 }, material(controlIndex === index ? palette.primary : 0xb5c4cc, { emissive: controlIndex === index ? palette.primary : 0x000000, emissiveIntensity: 0.56, metalness: 0.45, roughness: 0.22 }), 'incident-component-control', { x: Math.PI / 2, y: 0, z: 0 }, 12));
    const dial = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 8, 20), material(0xb9c9d1, { metalness: 0.8, roughness: 0.16 }));
    dial.name = 'incident-component-dial';
    dial.position.set(0, 0.43, -0.26);
    root.add(dial);
    screen.userData.shipAnimated = 'screen';
    screen.userData.baseEmissiveIntensity = 0.7;
    group.add(root);
    return { root, indicator, offset, step };
  });
  const warningLight = new THREE.PointLight(palette.primary, 1.4, 8, 2);
  warningLight.position.y = 1.45;
  group.add(warningLight);
  deckState.group.add(group);
  session.incidentPresentation = {
    eventId: pending.id,
    roomId: room.id,
    roomLabel: room.label,
    deckId: room.deckId,
    deckLabel: getShipDeck(room.deckId)?.label || room.deckId,
    group,
    ring,
    column,
    particles,
    nodes,
    warningLight,
    x,
    z
  };
  session.selectedRoomId = room.id;
  session.selectedStationId = station?.id || null;
  session.manualGuidance = false;
  session.mapDeckId = room.deckId;
  let cue = document.getElementById('shipObjectiveCue');
  if (!cue) {
    cue = document.createElement('aside');
    cue.id = 'shipObjectiveCue';
    document.body.appendChild(cue);
  }
  cue.innerHTML = `<span>SHIP RESPONSE</span><strong>${pending.title}</strong><small>${getShipDeck(room.deckId)?.label || room.deckId} · ${room.label}</small><button type="button">Show route</button>`;
  cue.classList.add('show');
  cue.querySelector('button')?.addEventListener('click', () => {
    session.mapDeckId = room.deckId;
    toggleShipMap(true);
  });
  return true;
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
  const procedure = session.incidentProcedure;
  const presentation = session.incidentPresentation;
  if (procedure && presentation?.deckId === session.activeDeckId && !procedure.completing) {
    const node = presentation.nodes[procedure.stepIndex];
    if (node) stations.push({
      id: `incident-step:${procedure.eventId}:${procedure.stepIndex}`,
      deckId: presentation.deckId,
      roomId: presentation.roomId,
      label: node.step.label,
      x: presentation.x + node.offset.x,
      z: presentation.z + node.offset.z,
      radius: 2.15,
      kind: 'ship-incident-step',
      level: 0
    });
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
  syncShipGuidance(session);
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
    x: ((z - SHIP_DECK_BOUNDS.minZ) / (SHIP_DECK_BOUNDS.maxZ - SHIP_DECK_BOUNDS.minZ)) * 100,
    y: ((x - SHIP_DECK_BOUNDS.minX) / (SHIP_DECK_BOUNDS.maxX - SHIP_DECK_BOUNDS.minX)) * 100
  };
}

function mapRoomRect(room) {
  const a = mapPoint(room.minX, room.minZ);
  const b = mapPoint(room.maxX, room.maxZ);
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

function stationGuidance(stationId, title, detail, source = 'ship') {
  const station = SHIP_STATIONS.find((entry) => entry.id === stationId);
  if (!station) return null;
  const room = SHIP_ROOMS.find((entry) => entry.id === station.roomId);
  return Object.freeze({
    source,
    title,
    detail,
    deckId: station.deckId,
    roomId: station.roomId,
    stationId: station.id,
    x: station.x,
    z: station.z,
    deckLabel: getShipDeck(station.deckId)?.label || station.deckId,
    roomLabel: room?.label || station.label
  });
}

function deriveShipGuidance(session) {
  const pending = session?.expedition?.pendingEvent;
  if (pending?.roomId) {
    const station = SHIP_STATIONS.find((entry) => entry.roomId === pending.roomId && !entry.id.startsWith('deck-lift:'));
    if (station) return stationGuidance(station.id, pending.title, `Respond at ${station.label}.`, 'voyage-event');
  }

  const mission = appCtx.getDestinationMissionSnapshot?.();
  if (mission?.activeMissionId) {
    if (mission.phase === 'analysis') {
      return stationGuidance('analysis-review', mission.currentObjective || mission.title, 'Review the returned field evidence in Analysis & Data.', 'destination-mission');
    }
    if (mission.phase === 'fieldwork' && mission.surfaceRequired && mission.atDestination) {
      return stationGuidance('craft-bay-status', mission.currentObjective || mission.title, 'Board the pod at its side hatch and launch for the surface.', 'destination-mission');
    }
    if (mission.phase === 'approach' || mission.phase === 'available') {
      return stationGuidance('bridge-flight', mission.currentObjective || mission.title, 'Return to flight and follow the active destination course.', 'destination-mission');
    }
    if (mission.phase === 'complete') {
      return stationGuidance('bridge-log', 'Mission record complete', 'Review the completed mission in the Captain’s Log.', 'destination-mission');
    }
  }

  const localContactReady = (session?.expedition?.routeContacts || []).some((contact) => ['available', 'returned'].includes(contact.localOperationState));
  if (localContactReady) {
    return stationGuidance('craft-bay-status', 'Surface operation available', 'Board the pod at its side hatch and choose the surveyed local world.', 'local-operation');
  }
  if (session?.expedition?.state === 'planned') {
    return stationGuidance('bridge-flight', 'Ready for departure', 'Return to flight controls when you are ready to begin the Expedition.', 'expedition');
  }
  return stationGuidance('navigation-course', 'Continue the current watch', 'Review the route and arrival margins in Navigation & Cartography.', 'expedition');
}

function ensureShipObjectiveCue() {
  let cue = document.getElementById('shipObjectiveCue');
  if (!cue) {
    cue = document.createElement('aside');
    cue.id = 'shipObjectiveCue';
    document.body.appendChild(cue);
  }
  return cue;
}

function syncShipGuidance(session = activeSession) {
  if (!session) return null;
  const guidance = deriveShipGuidance(session);
  session.objectiveGuidance = guidance;
  if (!session.manualGuidance && guidance) {
    session.selectedRoomId = guidance.roomId;
    session.selectedStationId = guidance.stationId;
  }
  if (session.incidentProcedure) return guidance;
  const cue = ensureShipObjectiveCue();
  if (!guidance) {
    cue.classList.remove('show');
    return null;
  }
  const transfer = guidance.deckId !== session.activeDeckId
    ? `Take the deck lift to ${guidance.deckLabel}.`
    : `${guidance.roomLabel} · ${guidance.detail}`;
  cue.innerHTML = `<span>CURRENT SHIP OBJECTIVE</span><strong>${guidance.title}</strong><small>${transfer}</small><button type="button">${guidance.deckId === session.activeDeckId ? 'Show route' : 'Route via lift'}</button>`;
  cue.classList.add('show');
  cue.querySelector('button')?.addEventListener('click', () => {
    session.manualGuidance = false;
    session.selectedRoomId = guidance.roomId;
    session.selectedStationId = guidance.stationId;
    session.mapDeckId = guidance.deckId;
    toggleShipMap(true);
  });
  return guidance;
}

function selectedMapTarget(session) {
  const station = SHIP_STATIONS.find((entry) => entry.id === session.selectedStationId);
  if (station) return { ...station };
  const room = SHIP_ROOMS.find((entry) => entry.id === session.selectedRoomId);
  if (!room) return null;
  return {
    deckId: room.deckId,
    roomId: room.id,
    label: room.label,
    x: (room.minX + room.maxX) * 0.5,
    z: (room.minZ + room.maxZ) * 0.5
  };
}

function routePointsToTarget(start, target) {
  const room = SHIP_ROOMS.find((entry) => entry.id === target.roomId);
  const door = SHIP_DOORS.find((entry) => entry.roomId === target.roomId);
  if (!room || !door) return [start, { x: target.x, z: target.z }];
  return [
    start,
    { x: 0, z: start.z },
    { x: 0, z: door.z },
    { x: door.x, z: door.z },
    { x: target.x, z: target.z }
  ];
}

function routePolyline(session, deckId) {
  const target = selectedMapTarget(session);
  if (!target) return '';
  const walker = appCtx.Walk.state.walker;
  let route = [];
  if (target.deckId === session.activeDeckId && deckId === session.activeDeckId) {
    route = routePointsToTarget({ x: walker.x, z: walker.z }, target);
  } else if (deckId === session.activeDeckId) {
    route = [{ x: walker.x, z: walker.z }, { x: 0, z: walker.z }, { x: 0, z: 0 }];
  } else if (deckId === target.deckId) {
    route = routePointsToTarget({ x: 0, z: 0 }, target);
  }
  if (route.length < 2) return '';
  const points = route.map((point) => mapPoint(point.x, point.z));
  return `<svg class="ship-map-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"/></svg>`;
}

function deckMapMarkup(session, deckId, compact = false) {
  const deck = getShipDeck(deckId);
  if (!deck) return '';
  const walker = appCtx.Walk.state.walker;
  const player = mapPoint(walker.x, walker.z);
  const target = selectedMapTarget(session);
  const state = session.sceneState.deckStates.get(deckId);
  const crew = session.sceneState.crewMeshes.filter((mesh) => mesh.userData.deckId === deckId);
  return `<div class="ship-map-deck ${compact ? 'compact' : ''}" data-deck-map="${deckId}">
    ${routePolyline(session, deckId)}
    ${deck.rooms.map((room) => {
      const rect = mapRoomRect(room);
      const status = session.expedition?.systems?.[room.systemId]?.status || 'optimal';
      return `<button type="button" class="ship-map-room status-${status} ${session.selectedRoomId === room.id ? 'selected' : ''}" data-room="${room.id}" style="left:${rect.left}%;top:${rect.top}%;width:${rect.width}%;height:${rect.height}%" title="${room.label}">${compact ? '' : `<span>${room.label}</span>`}</button>`;
    }).join('')}
    ${(state?.doorStates || []).map((door) => { const point = mapPoint(door.x, door.z); return `<i class="ship-map-door ${door.open ? 'open' : ''}" style="left:${point.x}%;top:${point.y}%"></i>`; }).join('')}
    ${target?.deckId === deckId ? (() => { const point = mapPoint(target.x, target.z); return `<i class="ship-map-objective" style="left:${point.x}%;top:${point.y}%" title="${target.label || 'Current objective'}"></i>`; })() : ''}
    ${target && target.deckId !== session.activeDeckId && deckId === session.activeDeckId ? (() => { const point = mapPoint(0, 0); return `<i class="ship-map-lift" style="left:${point.x}%;top:${point.y}%" title="Deck lift"></i>`; })() : ''}
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
    const target = selectedMapTarget(session);
    const targetDeck = target?.deckId;
    const footer = target
      ? targetDeck !== session.activeDeckId
        ? session.mapDeckId === session.activeDeckId
          ? `Follow the route to the deck lift, then choose ${getShipDeck(targetDeck)?.label || targetDeck}.`
          : session.mapDeckId === targetDeck
            ? `After the lift, follow the route to ${target.label}.`
            : `Objective is on ${getShipDeck(targetDeck)?.label || targetDeck}.`
        : `Guidance set: ${target.label}.`
      : 'Choose a room for internal guidance. Use the deck lift to change decks.';
    overlay.innerHTML = `<section><header><div><span>SURVEYOR</span><strong>Ship Map</strong></div><button type="button" data-close-map>×</button></header><nav>${SHIP_DECKS.map((deck) => `<button type="button" data-map-deck="${deck.id}" class="${deck.id === session.mapDeckId ? 'active' : ''}">${deck.shortLabel}</button>`).join('')}</nav>${deckMapMarkup(session, session.mapDeckId, false)}<footer>${footer}</footer></section>`;
    overlay.querySelector('[data-close-map]')?.addEventListener('click', () => toggleShipMap(false));
    overlay.querySelectorAll('[data-map-deck]').forEach((button) => button.addEventListener('click', () => { session.mapDeckId = button.dataset.mapDeck; renderShipMaps(session); }));
  }
  document.querySelectorAll('.ship-map-room[data-room]').forEach((button) => button.addEventListener('click', () => {
    session.selectedRoomId = button.dataset.room;
    session.selectedStationId = null;
    session.manualGuidance = true;
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
  syncIncidentPresentation(activeSession);
  syncShipGuidance(activeSession);
  renderShipMaps(activeSession);
  ensureShipHud(expedition, activeSession.operationSummary);
  return true;
}

function ensureShipMaps(session) {
  if (!document.getElementById('expeditionShipStyles')) {
    const link = document.createElement('link');
    link.id = 'expeditionShipStyles';
    link.rel = 'stylesheet';
    link.href = 'styles/expedition-ship.css?v=6';
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
    selectedStationId: null,
    manualGuidance: false,
    objectiveGuidance: null,
    mapRefreshElapsed: 0,
    bodyHadShipInteriorClass: document.body.classList.contains('expedition-ship-interior-open'),
    operations: Object.freeze([]),
    operationSummary: null,
    operationRefreshElapsed: 0,
    visualClock: 0,
    audioContext: null,
    ambientOscillator: null,
    actionFeedback: null,
    incidentPresentation: null,
    incidentProcedure: null
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
  syncIncidentPresentation(session);
  syncShipGuidance(session);
  ensureShipMaps(session);
  ensureShipHud(options.expedition, session.operationSummary);
  if (session.incidentPresentation) playShipTone('alert');
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
  document.getElementById('shipObjectiveCue')?.classList.remove('show');
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
  if (interaction.kind === 'ship-incident-step') {
    void advanceIncidentProcedure(interaction);
    return true;
  }
  const result = activeSession.onInteraction?.(interaction, activeSession.expedition);
  return result !== false;
}

function updateLocalSpaceView(session, dt) {
  const view = session?.sceneState?.spaceView;
  const flight = appCtx.spaceFlight;
  if (!view?.texture || !view.camera || !flight?.scene || !flight.renderer || !flight.rocket) return false;
  view.elapsed += Math.max(0, Number(dt) || 0);
  if (view.elapsed < 1 / 15) return false;
  view.elapsed = 0;
  view.position ||= new THREE.Vector3();
  view.quaternion ||= new THREE.Quaternion();
  view.forward ||= new THREE.Vector3();
  view.up ||= new THREE.Vector3();
  view.lookAt ||= new THREE.Vector3();
  flight.rocket.updateMatrixWorld?.(true);
  flight.rocket.getWorldPosition(view.position);
  flight.rocket.getWorldQuaternion(view.quaternion);
  view.forward.set(0, 1, 0).applyQuaternion(view.quaternion).normalize();
  view.up.set(0, 0, -1).applyQuaternion(view.quaternion).normalize();
  view.camera.position.copy(view.position).addScaledVector(view.forward, 18);
  view.camera.up.copy(view.up);
  view.lookAt.copy(view.position).addScaledVector(view.forward, 2200);
  view.camera.lookAt(view.lookAt);
  const rocketWasVisible = flight.rocket.visible;
  flight.rocket.visible = false;
  try {
    flight.renderer.render(flight.scene, view.camera);
    view.texture.needsUpdate = true;
    view.frameCount += 1;
  } finally {
    flight.rocket.visible = rocketWasVisible;
  }
  return true;
}

function updateExpeditionShipInterior(dt) {
  if (!activeSession) return false;
  const tutorialCard = document.getElementById('tutorialHintCard');
  if (tutorialCard && tutorialCard.style.display !== 'none') tutorialCard.style.display = 'none';
  updateCrewMotion(activeSession, dt);
  updateLocalSpaceView(activeSession, dt);
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
  const incident = activeSession.incidentPresentation;
  if (incident) {
    const elapsed = activeSession.visualClock;
    incident.ring.rotation.z = elapsed * 1.35;
    incident.ring.scale.setScalar(1 + Math.sin(elapsed * 4.2) * 0.1);
    incident.column.material.opacity = 0.09 + (Math.sin(elapsed * 3.1) + 1) * 0.035;
    incident.warningLight.intensity = 1.15 + (Math.sin(elapsed * 5.2) + 1) * 0.45;
    incident.particles.forEach((particle) => {
      const phase = elapsed * 1.8 + particle.userData.phase;
      particle.position.y = particle.userData.baseY + (Math.sin(phase) + 1) * 0.28;
      particle.scale.setScalar(0.7 + (Math.sin(phase * 1.7) + 1) * 0.22);
    });
  }
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
  const walker = appCtx.Walk?.state?.walker;
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
    incidentPresentation: activeSession.incidentPresentation ? {
      eventId: activeSession.incidentPresentation.eventId,
      roomId: activeSession.incidentPresentation.roomId,
      deckId: activeSession.incidentPresentation.deckId,
      visible: activeSession.incidentPresentation.group.visible !== false
    } : null,
    incidentProcedure: activeSession.incidentProcedure ? {
      eventId: activeSession.incidentProcedure.eventId,
      choiceId: activeSession.incidentProcedure.choiceId,
      stepIndex: activeSession.incidentProcedure.stepIndex,
      stepCount: activeSession.incidentProcedure.steps.length,
      completing: activeSession.incidentProcedure.completing,
      currentInteractionId: activeSession.incidentProcedure.completing
        ? ''
        : `incident-step:${activeSession.incidentProcedure.eventId}:${activeSession.incidentProcedure.stepIndex}`
    } : null,
    audioState: activeSession.audioContext?.state || 'not-started',
    visualContract: { ...activeSession.sceneState.visualContract },
    exteriorView: activeSession.sceneState.spaceView ? {
      source: activeSession.sceneState.spaceView.source,
      frameCount: activeSession.sceneState.spaceView.frameCount,
      surfaceCount: activeSession.sceneState.spaceView.surfaces.length
    } : null,
    player: walker ? {
      x: Number(walker.x.toFixed(3)),
      y: Number(walker.y.toFixed(3)),
      z: Number(walker.z.toFixed(3)),
      yaw: Number(walker.yaw.toFixed(3)),
      grounded: walker.onGround === true
    } : null,
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
  startExpeditionIncidentProcedure: startIncidentProcedure,
  updateExpeditionShipInterior
});

export { enterSurveyorInterior, exitSurveyorInterior, getShipInteriorSnapshot, handleShipInteriorInteraction, playExpeditionShipAction, startIncidentProcedure, switchSurveyorDeck, toggleShipMap, updateExpeditionShipInterior, updateExpeditionShipRecord };
