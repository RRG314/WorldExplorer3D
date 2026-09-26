import { icrsToCartesian } from './catalog.js?v=11';
import { createGaiaSkyLayers, rebuildGaiaSkyLayers } from '../sky/gaia-catalog.js?v=4';

const SKY_RADIUS = 185000;

function observerCartesian(entity) {
  if (!entity || entity.id === 'sol') return new THREE.Vector3();
  const position = entity.canonicalPosition || {};
  if (position.frame !== 'ICRS') return new THREE.Vector3();
  const xyz = icrsToCartesian(entity);
  return new THREE.Vector3(xyz.x, xyz.y, xyz.z);
}

function rebuildGaiaGeometry(state) {
  if (state?.disposed || state?.gaiaSky?.disposed || !state.gaiaSky.stars.length || !state.currentEntity) return;
  const observer = observerCartesian(state.currentEntity);
  rebuildGaiaSkyLayers(state.gaiaSky, observer);
}

function createUniverseSky(scene) {
  const group = new THREE.Group();
  group.name = 'Frame-relative universe sky';
  group.visible = false;
  const gaiaSky = createGaiaSkyLayers({
    name: 'Frame-relative ESA Gaia DR3 sky',
    radius: SKY_RADIUS * 0.93,
    brightSize: 3.3,
    faintSize: 1.65
  });
  group.add(gaiaSky.group);
  scene.add(group);

  const state = {
    group,
    gaiaSky,
    currentEntity: null,
    loadPromise: gaiaSky.ready,
    disposed: false
  };
  state.loadPromise.then(() => rebuildGaiaGeometry(state));
  return state;
}

function setUniverseSkyFrame(state, entity, visible) {
  if (!state) return;
  state.currentEntity = entity || null;
  state.lastObserver = null;
  state.lastObserverUpdate = null;
  state.group.visible = Boolean(visible);
  if (state.group.visible) rebuildGaiaGeometry(state);
}

function updateUniverseSky(state, rocket, observer = null, now = performance.now()) {
  if (!state?.group?.visible || !rocket) return;
  state.group.position.copy(rocket.position);
  if (observer && (!state.lastObserverUpdate || now - state.lastObserverUpdate >= 250) && (!state.lastObserver || Math.hypot(observer.x-state.lastObserver.x, observer.y-state.lastObserver.y, observer.z-state.lastObserver.z) > 0.001)) {
    state.lastObserverUpdate = now;
    state.lastObserver = { ...observer };
    rebuildGaiaSkyLayers(state.gaiaSky, new THREE.Vector3(observer.x, observer.y, observer.z));
  }
}

export { createUniverseSky, setUniverseSkyFrame, updateUniverseSky };
