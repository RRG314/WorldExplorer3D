import { ctx as appCtx } from '../shared-context.js?v=55';
import { parentSkyPlacement } from './parent-sky-placement.js';
import { getAstronomicalBody } from '../astronomy/body-catalog.js?v=3';
import { PLANETARY_BODIES, configureColorTexture } from './catalog.js?v=1';

const moon=getAstronomicalBody('moon'),parent=getAstronomicalBody('earth');
const placement=parentSkyPlacement({latitudeDeg:.67408,longitudeDeg:23.47297,
  bodyRadiusM:moon.physical.meanRadiusM,parentRadiusM:parent.physical.meanRadiusM,
  parentMassKg:parent.physical.massKg,bodyMassKg:moon.physical.massKg,orbitalPeriodS:moon.physical.orbitalPeriodS});
const LUNAR_EARTH_DIRECTION=new THREE.Vector3(placement.direction.x,placement.direction.y,placement.direction.z);
const LUNAR_EARTH_DISTANCE=placement.renderDistance;
const LUNAR_EARTH_RADIUS=placement.renderRadius;

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
  earth.userData.parentSkyPlacement=placement;
  appCtx.lunarEarthSphere = earth;
  return earth;
}

function setLunarEarthVisible(visible) {
  const earth = visible ? ensureLunarEarthSphere() : appCtx.lunarEarthSphere;
  if (!earth) return;
  earth.visible = !!visible;
  if (visible && earth.parent !== appCtx.scene) appCtx.scene.add(earth);
  if (!visible && earth.parent === appCtx.scene) appCtx.scene.remove(earth);
}

function updateLunarEarthPosition(x=0,y=0,z=0) {
  const earth = appCtx.lunarEarthSphere;
  if (!earth) return;
  if (!earth.visible) return;
  earth.position.copy(LUNAR_EARTH_DIRECTION).multiplyScalar(LUNAR_EARTH_DISTANCE);
  earth.position.x+=x;earth.position.y+=y;earth.position.z+=z;
  earth.rotation.y = (Date.now() % 86164100) / 86164100 * Math.PI * 2;
}

Object.assign(appCtx, {
  ensureLunarEarthSphere,
  setLunarEarthVisible,
  updateLunarEarthPosition
});

export { ensureLunarEarthSphere, setLunarEarthVisible, updateLunarEarthPosition };
