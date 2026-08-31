import { ctx as appCtx } from '../shared-context.js?v=55';
import { getPrimaryWorldCanvas } from '../engine/webgl-lifecycle.js?v=1';
import { SHIP_CREW_POSTS, SHIP_DECK_BOUNDS, SHIP_ROOMS, SHIP_STATIONS } from './ship-layout.js?v=1';

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
  const screen = material(accent, { emissive: accent, emissiveIntensity: 1.05, metalness: 0.08, roughness: 0.3 });
  box(consoleGroup, { x: 2.4, y: 0.82, z: 0.78 }, { x: 0, y: 0.42, z: 0 }, dark);
  const display = box(consoleGroup, { x: 2.05, y: 0.52, z: 0.08 }, { x: 0, y: 0.93, z: -0.31 }, screen);
  display.rotation.x = -0.32;
  consoleGroup.position.set(x, 0, z);
  consoleGroup.rotation.y = yaw;
  group.add(consoleGroup);
  return consoleGroup;
}

function addCrewMember(group, post, crew) {
  const root = new THREE.Group();
  root.name = `ship-crew:${crew?.id || post.crewId}`;
  root.userData.crewId = crew?.id || post.crewId;
  root.userData.crewName = crew?.name || 'Surveyor crew';
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

function addRoomDetails(group) {
  const consoleBlue = 0x3aa8d8;
  addConsole(group, -4.5, 32.1, Math.PI, consoleBlue, 'navigation');
  addConsole(group, 4.5, 32.1, Math.PI, 0x5ed69d, 'flight');
  addConsole(group, 0, 27.2, 0, 0xe7a648, 'captain-log');
  addConsole(group, -8.2, 13.4, Math.PI / 2, 0x58b6e6, 'science');
  addConsole(group, 8.2, 13.4, -Math.PI / 2, 0x6ad0b1, 'medical');
  addConsole(group, 8.2, -1.5, -Math.PI / 2, 0x73d99d, 'life-support');
  addConsole(group, -8.2, -13.8, Math.PI / 2, 0xdfa14a, 'fabrication');
  addConsole(group, 0, -29.5, 0, 0xe27948, 'engineering');

  const bed = material(0xbecbd9, { roughness: 0.76, metalness: 0.08 });
  [-1.7, 1.7].forEach((offset) => box(group, { x: 1.2, y: 0.55, z: 3.2 }, { x: 8.6 + offset, y: 0.3, z: 19.2 }, bed, 'medical-bed'));
  const hydro = material(0x2f8b5d, { emissive: 0x123d28, emissiveIntensity: 0.45, roughness: 0.82, metalness: 0 });
  [-2.2, 0, 2.2].forEach((z) => box(group, { x: 1.4, y: 1.6, z: 1.2 }, { x: 10.2, y: 0.82, z }, hydro, 'life-support-grow-bed'));
  const cargo = material(0x75614b, { roughness: 0.88, metalness: 0.1 });
  [-18, -14.7, -11.4].forEach((z) => box(group, { x: 2.1, y: 1.6, z: 2.25 }, { x: -10, y: 0.82, z }, cargo, 'secured-cargo'));
  const craft = material(0x8da2b8, { metalness: 0.48, roughness: 0.34 });
  const shuttle = new THREE.Group();
  shuttle.name = 'local-survey-craft';
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 5.2, 16), craft);
  hull.rotation.x = Math.PI / 2;
  shuttle.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.8, 16), craft);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3.45;
  shuttle.add(nose);
  shuttle.position.set(8.2, 1.25, -15.2);
  group.add(shuttle);
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

function buildSurveyorScene(expedition) {
  const root = new THREE.Group();
  root.name = 'expedition-ship:surveyor';
  root.userData.environmentOwner = 'SPACE_FLIGHT:SHIP_INTERIOR';
  const colliders = [];
  const deck = material(0x283444, { roughness: 0.72, metalness: 0.36 });
  const wallSurface = material(0xb8c3cf, { roughness: 0.66, metalness: 0.2, emissive: 0x111820, emissiveIntensity: 0.12 });
  const ceiling = material(0x5f6f80, { roughness: 0.74, metalness: 0.22, emissive: 0x18212b, emissiveIntensity: 0.18 });
  const corridor = material(0x314d64, { roughness: 0.58, metalness: 0.3 });
  const accent = material(0x2d9ec4, { emissive: 0x18566d, emissiveIntensity: 0.74, roughness: 0.4 });

  box(root, { x: 26, y: 0.18, z: 72 }, { x: 0, y: -0.08, z: 0 }, deck, 'surveyor-deck');
  box(root, { x: 4.9, y: 0.04, z: 69.5 }, { x: 0, y: 0.03, z: 0 }, corridor, 'surveyor-central-corridor');
  box(root, { x: 26, y: 0.16, z: 72 }, { x: 0, y: 3.48, z: 0 }, ceiling, 'surveyor-ceiling');

  wall(root, colliders, { x: -13, z: -36 }, { x: -13, z: 36 }, wallSurface, 'hull-port');
  wall(root, colliders, { x: 13, z: -36 }, { x: 13, z: 36 }, wallSurface, 'hull-starboard');
  wall(root, colliders, { x: -13, z: -36 }, { x: 13, z: -36 }, wallSurface, 'hull-aft');
  colliders.push(colliderForBox(0, 36, 26, 0.28, 0, 3.35, 'hull-forward-window'));
  partitionWithDoor(root, colliders, -13, 13, 24, 0, wallSurface, 'bridge-bulkhead');
  partitionWithDoor(root, colliders, -13, 13, -23, 0, wallSurface, 'engineering-bulkhead');
  [-7, 8].forEach((z, index) => partitionWithDoor(root, colliders, -13, 13, z, 0, wallSurface, `deck-bulkhead:${index}`));
  sidePartitionWithDoor(root, colliders, -2.7, -23, -8, -14.5, wallSurface, 'corridor-port-aft');
  sidePartitionWithDoor(root, colliders, -2.7, -6, 7, 0.5, wallSurface, 'corridor-port-mid');
  sidePartitionWithDoor(root, colliders, -2.7, 9, 22, 15.5, wallSurface, 'corridor-port-fore');
  sidePartitionWithDoor(root, colliders, 2.7, -23, -8, -14.5, wallSurface, 'corridor-starboard-aft');
  sidePartitionWithDoor(root, colliders, 2.7, -6, 7, 0.5, wallSurface, 'corridor-starboard-mid');
  sidePartitionWithDoor(root, colliders, 2.7, 9, 22, 15.5, wallSurface, 'corridor-starboard-fore');

  SHIP_ROOMS.forEach((room) => {
    const stripeX = room.side === 'port' ? room.maxX - 0.08 : room.side === 'starboard' ? room.minX + 0.08 : room.minX + 0.12;
    box(root, { x: room.side === 'full' ? room.maxX - room.minX - 1 : 0.09, y: 0.05, z: room.side === 'full' ? 0.09 : room.maxZ - room.minZ - 1 }, {
      x: room.side === 'full' ? (room.minX + room.maxX) * 0.5 : stripeX,
      y: 0.04,
      z: room.side === 'full' ? room.minZ + 0.7 : (room.minZ + room.maxZ) * 0.5
    }, accent, `room-marker:${room.id}`);
  });

  addRoomDetails(root);
  addBridgeView(root);
  const crewById = new Map((expedition?.crew || []).map((crew) => [crew.id, crew]));
  const crewMeshes = SHIP_CREW_POSTS.map((post) => addCrewMember(root, post, crewById.get(post.crewId)));

  root.add(new THREE.HemisphereLight(0xcde7ff, 0x162130, 1.05));
  const fill = new THREE.DirectionalLight(0xf4f7ff, 1.18);
  fill.position.set(8, 18, 8);
  root.add(fill);
  [-29, -15, 0, 15, 29].forEach((z) => {
    const light = new THREE.PointLight(z < -22 ? 0xffc58f : 0xbde9ff, 0.78, 22, 2);
    light.position.set(0, 3.18, z);
    root.add(light);
  });

  return {
    root,
    colliders,
    crewMeshes,
    walkSurface: {
      kind: 'polygon',
      pts: [
        { x: SHIP_DECK_BOUNDS.minX, z: SHIP_DECK_BOUNDS.minZ },
        { x: SHIP_DECK_BOUNDS.maxX, z: SHIP_DECK_BOUNDS.minZ },
        { x: SHIP_DECK_BOUNDS.maxX, z: SHIP_DECK_BOUNDS.maxZ },
        { x: SHIP_DECK_BOUNDS.minX, z: SHIP_DECK_BOUNDS.maxZ }
      ],
      y: 0,
      label: 'Surveyor main deck'
    }
  };
}

function ensureShipHud(expedition) {
  let hud = document.getElementById('shipInteriorHud');
  if (!hud) {
    hud = document.createElement('section');
    hud.id = 'shipInteriorHud';
    document.body.appendChild(hud);
  }
  const progress = Math.round((Number(expedition?.progress) || 0) * 100);
  hud.innerHTML = `<div><span>SURVEYOR · MAIN DECK</span><strong>${expedition?.state === 'planned' ? 'Expedition staging' : `${progress}% to ${String(expedition?.destinationId || 'destination').replaceAll('-', ' ')}`}</strong><small>Move through the ship · E interacts · C changes view</small></div><div><button id="shipJournalButton" type="button">Journal</button><button id="shipExitButton" type="button">Return to flight</button></div>`;
  hud.classList.add('show');
  hud.querySelector('#shipExitButton')?.addEventListener('click', () => exitSurveyorInterior());
  hud.querySelector('#shipJournalButton')?.addEventListener('click', () => appCtx.toggleWorldDiscoveryJournal?.(true));
  return hud;
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
    overlayDisplays: Object.fromEntries(['mainMenuBtn', 'gameShareFloatBtn'].map((id) => [id, document.getElementById(id)?.style.display || ''])),
    skyVisibility: Object.fromEntries(['sunSphere', 'moonSphere', 'starField'].map((key) => [key, appCtx[key]?.visible !== false])),
    sceneState,
    worldCanvas
  };
  activeSession = session;

  if (appCtx.spaceFlight.animationId != null) cancelAnimationFrame(appCtx.spaceFlight.animationId);
  appCtx.spaceFlight.animationId = null;
  appCtx.spaceFlight.active = false;
  appCtx.spaceFlight.keys = {};
  appCtx.activeShipInterior = true;
  if (appCtx.spaceFlight.canvas) appCtx.spaceFlight.canvas.style.display = 'none';
  if (appCtx.spaceFlight.hud) appCtx.spaceFlight.hud.style.display = 'none';
  appCtx.hideSolarSystemUI?.();
  appCtx.hideUniverseUI?.();
  ['mainMenuBtn', 'gameShareFloatBtn'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
  });
  if (worldCanvas) worldCanvas.style.display = 'block';
  appCtx.setEarthSceneVisible?.(false);
  ['sunSphere', 'moonSphere', 'starField'].forEach((key) => {
    if (appCtx[key]) appCtx[key].visible = false;
  });
  appCtx.scene.add(sceneState.root);
  appCtx.replaceWorldCollection('dynamicBuildingColliders', sceneState.colliders.slice());

  appCtx.activeInterior = {
    key: 'expedition-ship:surveyor',
    label: 'Surveyor',
    mode: 'authored-ship',
    environmentKind: 'expedition-ship',
    group: sceneState.root,
    walkSurfaces: [sceneState.walkSurface],
    placementTargets: [],
    center: { x: 0, z: 0 },
    usableFootprint: sceneState.walkSurface.pts,
    floorPlan: { floorCount: 1, storyHeight: 3.5 },
    floorId: 'surveyor-main-deck',
    floorLabel: 'Main Deck',
    floorBaseY: 0,
    activeLevel: 0,
    loadedLevels: [0],
    connector: null,
    stairs: [],
    interactions: SHIP_STATIONS.map((station) => ({ ...station, kind: station.id === 'return-to-flight' ? 'ship-exit' : 'ship-station', level: 0 })),
    entryPoint: { x: 0, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, z: 20.5 },
    lastValidPosition: { x: 0, y: (appCtx.Walk.CFG.eyeHeight || 1.7) + 0.04, z: 20.5, yaw: 0, angle: 0 },
    containmentNoticeUntil: 0
  };
  appCtx.interiorHint = { state: 'inside', label: 'Surveyor', mode: 'authored-ship' };
  appCtx.setPauseReason?.('planetary_transition', false);
  applyShipWalkingState();
  appCtx.scene.background = new THREE.Color(0x02050b);
  appCtx.renderer.shadowMap.enabled = true;
  const interiorPrompt = document.getElementById('interiorPrompt');
  if (interiorPrompt) interiorPrompt.style.display = '';
  appCtx.renderLoop?.();
  ensureShipHud(options.expedition);
  appCtx.updateControlsModeUI?.();
  return true;
}

function exitSurveyorInterior() {
  const session = activeSession;
  if (!session) return false;
  activeSession = null;
  document.getElementById('shipInteriorHud')?.classList.remove('show');
  appCtx.toggleWorldDiscoveryJournal?.(false);
  appCtx.activeInterior = null;
  appCtx.interiorHint = null;
  appCtx.activeShipInterior = false;
  appCtx.replaceWorldCollection('dynamicBuildingColliders', session.dynamicBuildingColliders);
  session.sceneState.root.parent?.remove?.(session.sceneState.root);
  session.sceneState.root.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((entry) => entry?.dispose?.());
    else child.material?.dispose?.();
  });
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
  const result = activeSession.onInteraction?.(interaction, activeSession.expedition);
  return result !== false;
}

function getShipInteriorSnapshot() {
  if (!activeSession) return null;
  return {
    active: true,
    shipId: 'surveyor',
    deckId: 'main-deck',
    roomCount: SHIP_ROOMS.length,
    stationCount: SHIP_STATIONS.length,
    visibleCrewCount: activeSession.sceneState.crewMeshes.length,
    parentEnvironment: 'SPACE_FLIGHT',
    movementAuthority: 'Walk',
    collisionAuthority: 'activeInterior'
  };
}

Object.assign(appCtx, { exitExpeditionShipInterior: exitSurveyorInterior, getShipInteriorSnapshot, handleShipInteriorInteraction });

export { enterSurveyorInterior, exitSurveyorInterior, getShipInteriorSnapshot, handleShipInteriorInteraction };
