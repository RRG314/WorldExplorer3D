import { ctx as appCtx } from '../shared-context.js?v=55';
import { loadModelAssetInstance } from '../assets/model-asset-runtime.js?v=1';

let activeVehicle = null;
let earthChildVisibility = null;
let marsModelPromise = null;
let vehicleRequestSequence = 0;

function material(color, metalness = 0.35, roughness = 0.65) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function createWheel(radius, width, color = 0x34383b) {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 16),
    material(color, 0.5, 0.8)
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.castShadow = true;
  return wheel;
}

function createMarsRoverFallback() {
  const rover = new THREE.Group();
  rover.name = 'Mars Exploration Rover';

  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 2.7), material(0xb9a26f, 0.45, 0.5));
  deck.position.y = 1.45;
  rover.add(deck);

  const solar = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 2.45), material(0x1f405d, 0.65, 0.3));
  solar.position.y = 1.72;
  rover.add(solar);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 10), material(0xc8c2ae, 0.7, 0.35));
  mast.position.set(0, 2.65, -0.25);
  rover.add(mast);
  const cameraBar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.25), material(0xd9d4c4, 0.55, 0.4));
  cameraBar.position.set(0, 3.45, -0.25);
  rover.add(cameraBar);

  [-1.55, 0, 1.55].forEach((z) => {
    [-1, 1].forEach((side) => {
      const suspension = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.15), material(0x6f6555, 0.75, 0.45));
      suspension.position.set(side * 1.65, 0.9, z * 0.72);
      suspension.rotation.y = side * 0.18;
      rover.add(suspension);
      const wheel = createWheel(0.58, 0.34);
      wheel.position.set(side * 2.03, 0.62, z * 0.72);
      rover.add(wheel);
    });
  });
  rover.scale.setScalar(0.82);
  rover.rotation.y = Math.PI;
  rover.userData.vehicleKind = 'mars';
  return rover;
}

function createMercurySurveyRover() {
  const rover = new THREE.Group();
  rover.name = 'Mercury Survey Rover';
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.34, 2.15), material(0xc8bda8, 0.55, 0.48));
  frame.position.y = 1.05;
  rover.add(frame);
  const shade = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 1.65), material(0xa7844f, 0.48, 0.58));
  shade.position.set(0, 1.82, 0.05);
  rover.add(shade);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.15, 10), material(0xd9d4c8, 0.7, 0.38));
  mast.position.set(0.75, 2.35, -0.35);
  rover.add(mast);
  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.3, 0.32), material(0x30343b, 0.5, 0.42));
  sensor.position.set(0.75, 2.92, -0.35);
  rover.add(sensor);
  [-1.34, 1.34].forEach((x) => {
    [-0.8, 0.8].forEach((z) => {
      const wheel = createWheel(0.5, 0.3, 0x4a4641);
      wheel.position.set(x, 0.54, z);
      rover.add(wheel);
    });
  });
  rover.rotation.y = Math.PI;
  rover.userData.vehicleKind = 'mercury';
  return rover;
}

function createVenusPressureCrawler() {
  const crawler = new THREE.Group();
  crawler.name = 'Venus Pressure Crawler';
  const hullMaterial = material(0xd59a52, 0.68, 0.4);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1.55, 24, 16), hullMaterial);
  hull.scale.set(1.25, 0.82, 1);
  hull.position.y = 1.65;
  crawler.add(hull);
  const viewport = new THREE.Mesh(
    new THREE.SphereGeometry(1.58, 20, 12, -0.7, 1.4, 1.0, 0.55),
    new THREE.MeshPhysicalMaterial({ color: 0x38251b, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.82 })
  );
  viewport.scale.copy(hull.scale);
  viewport.position.copy(hull.position);
  viewport.rotation.y = Math.PI;
  crawler.add(viewport);
  const equipment = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.3), material(0x70462d, 0.58, 0.55));
  equipment.position.set(0, 1.05, 1.25);
  crawler.add(equipment);
  [-1.42, 1.42].forEach((x) => {
    [-0.83, 0.83].forEach((z) => {
      const wheel = createWheel(0.66, 0.42, 0x51453c);
      wheel.position.set(x, 0.62, z);
      crawler.add(wheel);
    });
  });
  crawler.rotation.y = Math.PI;
  crawler.userData.vehicleKind = 'venus';
  crawler.userData.protectedSurfaceCapability = true;
  return crawler;
}

const PLANETARY_ROVER_STYLES = Object.freeze({
  io: Object.freeze({ name: 'Io Radiation Survey Rover', body: 0xd0a34c, accent: 0x4b4337 }),
  europa: Object.freeze({ name: 'Europa Ice Survey Rover', body: 0xd9e2e8, accent: 0x315d78 }),
  titan: Object.freeze({ name: 'Titan Haze Survey Rover', body: 0xc28443, accent: 0x49372b, sealed: true }),
  enceladus: Object.freeze({ name: 'Enceladus Ice Survey Rover', body: 0xe2e8ec, accent: 0x596d7a }),
  triton: Object.freeze({ name: 'Triton Cryogenic Survey Rover', body: 0xb7b1ad, accent: 0x4d6473 }),
  ceres: Object.freeze({ name: 'Ceres Mineral Survey Rover', body: 0xa4a29b, accent: 0x5d5146 }),
  vesta: Object.freeze({ name: 'Vesta Basin Survey Rover', body: 0x978b7d, accent: 0x443d38 }),
  pluto: Object.freeze({ name: 'Pluto Ice Survey Rover', body: 0xc8b29e, accent: 0x506274 })
});

function createPlanetarySurveyRover(kind) {
  const style = PLANETARY_ROVER_STYLES[kind];
  const rover = new THREE.Group();
  rover.name = style.name;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.42, 2.25), material(style.body, 0.52, 0.52));
  chassis.position.y = 1.12;
  rover.add(chassis);
  const instrumentDeck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 1.65), material(style.accent, 0.48, 0.5));
  instrumentDeck.position.y = 1.56;
  rover.add(instrumentDeck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.25, 10), material(0xc7c9c7, 0.65, 0.4));
  mast.position.set(0.68, 2.2, -0.25);
  rover.add(mast);
  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.38), material(0x242a32, 0.52, 0.38));
  sensor.position.set(0.68, 2.84, -0.25);
  rover.add(sensor);
  if (style.sealed) {
    const cabin = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 18, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x60442f, metalness: 0.3, roughness: 0.25, transparent: true, opacity: 0.78 })
    );
    cabin.scale.set(1.2, 0.78, 0.9);
    cabin.position.set(-0.45, 2.05, 0.15);
    rover.add(cabin);
    rover.userData.protectedSurfaceCapability = true;
  }
  [-1.48, 0, 1.48].forEach((z) => {
    [-1, 1].forEach((side) => {
      const wheel = createWheel(0.5, 0.3, 0x34383b);
      wheel.position.set(side * 1.62, 0.56, z * 0.58);
      rover.add(wheel);
    });
  });
  rover.rotation.y = Math.PI;
  rover.userData.vehicleKind = kind;
  rover.userData.capabilityClass = 'fictional_planetary_survey_vehicle';
  return rover;
}

function createLunarRovingVehicle() {
  const lrv = new THREE.Group();
  lrv.name = 'Apollo Lunar Roving Vehicle';

  const frameMat = material(0xb9bcc1, 0.75, 0.35);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 2.2), frameMat);
  frame.position.y = 0.9;
  lrv.add(frame);

  const seatMat = material(0x7b6f5b, 0.15, 0.9);
  [-0.58, 0.58].forEach((x) => {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.0, 0.24), seatMat);
    seat.position.set(x, 1.48, 0.24);
    seat.rotation.x = -0.16;
    lrv.add(seat);
  });

  const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.42), material(0x222831, 0.35, 0.55));
  consoleMesh.position.set(0, 1.42, -0.78);
  lrv.add(consoleMesh);

  const goldFoil = material(0xc99a35, 0.72, 0.42);
  [-0.82, 0.82].forEach((x) => {
    const equipment = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.58, 0.62), goldFoil);
    equipment.position.set(x, 1.16, 0.82);
    lrv.add(equipment);
  });

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 8), frameMat);
  mast.position.set(0.72, 2.05, -0.65);
  lrv.add(mast);
  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.18, 20, 1, true),
    material(0xd8dadd, 0.68, 0.36)
  );
  dish.position.set(0.72, 2.72, -0.65);
  dish.rotation.x = -0.35;
  lrv.add(dish);

  const control = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.52, 8), frameMat);
  control.position.set(0, 1.92, -0.48);
  control.rotation.x = 0.28;
  lrv.add(control);

  [-1.65, 1.65].forEach((x) => {
    [-0.92, 0.92].forEach((z) => {
      const wheel = createLunarWheel();
      wheel.position.set(x, 0.58, z);
      lrv.add(wheel);
    });
  });
  lrv.rotation.y = Math.PI;
  lrv.userData.vehicleKind = 'moon';
  return lrv;
}

function createLunarWheel() {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(0.59, 0.075, 8, 24),
    material(0x92979a, 0.7, 0.55)
  );
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.32, 12),
    material(0x676d70, 0.78, 0.4)
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.5, 0.025),
      material(0xaeb2b4, 0.72, 0.5)
    );
    spoke.rotation.x = i / 8 * Math.PI;
    wheel.add(spoke);
  }
  wheel.castShadow = true;
  return wheel;
}

function rememberEarthVehicle() {
  if (!appCtx.carMesh || earthChildVisibility) return;
  earthChildVisibility = new Map(appCtx.carMesh.children.map((child) => [child, child.visible]));
}

function hideEarthVehicleChildren() {
  rememberEarthVehicle();
  earthChildVisibility?.forEach((visible, child) => {
    if (child !== activeVehicle) child.visible = false;
  });
}

function fitLoadedRover(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  root.scale.setScalar(5.4 / maxDimension);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  root.position.y -= fitted.min.y;
  root.rotation.y = Math.PI;
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  root.userData.vehicleKind = 'mars';
  return root;
}

function alignVehicleToSurface(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y)) root.position.y += -1.2 - bounds.min.y;
  return root;
}

function loadMarsRoverModel() {
  if (marsModelPromise) return marsModelPromise;
  const touchClient = globalThis.matchMedia?.('(pointer: coarse)')?.matches === true || Number(globalThis.navigator?.maxTouchPoints || 0) > 0;
  if (touchClient) {
    marsModelPromise = Promise.resolve(null);
    return marsModelPromise;
  }
  marsModelPromise = loadModelAssetInstance(THREE, 'planetary-rover-mars', {
    name: 'Mars Exploration Rover promoted model',
    qualityTier: 'promoted',
    receiveShadow: true,
    cachePolicy: 'while-in-use'
  }).then((instance) => {
    const root = fitLoadedRover(instance.root);
    root.userData.curatedAssetRelease = instance.release;
    return root;
  }).catch((error) => {
    console.warn('[planetary] NASA Mars rover model failed to load; using local fallback.', error);
    return null;
  });
  return marsModelPromise;
}

async function setPlanetaryVehicle(kind) {
  const requestId = ++vehicleRequestSequence;
  if (!appCtx.carMesh) return null;
  if (activeVehicle?.userData?.curatedAssetRelease && kind !== 'mars') {
    activeVehicle.userData.curatedAssetRelease();
    marsModelPromise = null;
  }
  if (activeVehicle?.parent) activeVehicle.parent.remove(activeVehicle);
  activeVehicle = null;

  if (!['moon', 'mars', 'mercury', 'venus', ...Object.keys(PLANETARY_ROVER_STYLES)].includes(kind)) {
    earthChildVisibility?.forEach((visible, child) => { child.visible = visible; });
    earthChildVisibility = null;
    return null;
  }

  hideEarthVehicleChildren();
  const vehicle = kind === 'moon' ? createLunarRovingVehicle() :
    kind === 'mars' ? createMarsRoverFallback() :
      kind === 'mercury' ? createMercurySurveyRover() :
        kind === 'venus' ? createVenusPressureCrawler() :
          createPlanetarySurveyRover(kind);
  activeVehicle = alignVehicleToSurface(vehicle);
  appCtx.carMesh.add(activeVehicle);

  if (kind === 'mars') {
    const loaded = await loadMarsRoverModel();
    if (
      loaded &&
      requestId === vehicleRequestSequence &&
      appCtx.onMars &&
      activeVehicle?.userData?.vehicleKind === 'mars'
    ) {
      appCtx.carMesh.remove(activeVehicle);
      activeVehicle = alignVehicleToSurface(loaded);
      appCtx.carMesh.add(activeVehicle);
    }
  }
  return activeVehicle;
}

Object.assign(appCtx, { setPlanetaryVehicle });

export { setPlanetaryVehicle };
