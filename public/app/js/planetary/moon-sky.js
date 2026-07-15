import { ctx as appCtx } from '../shared-context.js?v=55';
import { PLANETARY_BODIES, configureColorTexture } from './catalog.js?v=1';

// Apollo 11 local east/up/north direction toward the mean sub-Earth point.
// The Moon is tidally locked, so Earth stays in one region of the lunar sky
// instead of following the player's camera.
const LUNAR_EARTH_DIRECTION = new THREE.Vector3(-0.398, 0.917, -0.011).normalize();
const LUNAR_EARTH_DISTANCE = 9000;
const LUNAR_EARTH_RADIUS = 150;

function ensureLunarEarthSphere() {
  if (appCtx.lunarEarthSphere) return appCtx.lunarEarthSphere;
  const texture = configureColorTexture(
    new THREE.TextureLoader().load(PLANETARY_BODIES.earth.texture),
    appCtx.renderer
  );
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(LUNAR_EARTH_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      depthTest: true,
      depthWrite: false
    })
  );
  earth.name = 'Earth in Lunar Sky';
  earth.renderOrder = 40;
  earth.userData.planetaryBody = 'moon-sky';
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(LUNAR_EARTH_RADIUS * 1.035, 40, 28),
    new THREE.MeshBasicMaterial({
      color: 0x72b8ff,
      transparent: true,
      opacity: 0.1,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide
    })
  );
  atmosphere.renderOrder = 41;
  earth.add(atmosphere);
  earth.position.copy(LUNAR_EARTH_DIRECTION).multiplyScalar(LUNAR_EARTH_DISTANCE);
  earth.position.y -= 100;
  appCtx.lunarEarthSphere = earth;
  return earth;
}

function setLunarEarthVisible(visible) {
  const earth = ensureLunarEarthSphere();
  earth.visible = !!visible;
  if (visible && earth.parent !== appCtx.scene) appCtx.scene.add(earth);
  if (!visible && earth.parent === appCtx.scene) appCtx.scene.remove(earth);
}

function updateLunarEarthPosition() {
  const earth = ensureLunarEarthSphere();
  if (!earth.visible) return;
  earth.rotation.y = Date.now() * 0.000002;
}

Object.assign(appCtx, {
  ensureLunarEarthSphere,
  setLunarEarthVisible,
  updateLunarEarthPosition
});

export { ensureLunarEarthSphere, setLunarEarthVisible, updateLunarEarthPosition };
