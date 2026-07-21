import { ctx as appCtx } from '../shared-context.js?v=55';
import { curatedLandmarksNear } from './landmark-catalog.js?v=7';
import { createMeasuredEiffelTower } from './eiffel-structure.js?v=1';
import { createMeasuredElizabethTower } from './elizabeth-tower-structure.js?v=1';
import { createMeasuredKhufuPyramid } from './giza-pyramid-structure.js?v=3';

function disposeModel(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
    else object.material?.dispose?.();
  });
}

function colorizeModel(root, landmark) {
  const material = new THREE.MeshStandardMaterial({
    color: landmark.color,
    roughness: landmark.id === 'eiffel-tower' ? 0.63 : 0.9,
    metalness: landmark.id === 'eiffel-tower' ? 0.34 : 0.02,
    flatShading: landmark.id === 'pyramid-khufu',
    side: THREE.DoubleSide,
    emissive: landmark.id === 'eiffel-tower' ? 0x42200c : landmark.id === 'elizabeth-tower' ? 0x241c0e : 0x000000,
    emissiveIntensity: landmark.id === 'eiffel-tower' ? 0.72 : landmark.id === 'elizabeth-tower' ? 0.16 : 0
  });
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) object.material.forEach((item) => item?.dispose?.());
    else object.material?.dispose?.();
    object.material = material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  material.dispose();
}

function placeAtRealScale(root, landmark) {
  root.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(root);
  const sourceSize = bounds.getSize(new THREE.Vector3());
  const scale = {
    x: Number.isFinite(landmark.modelWidthMeters) ? landmark.modelWidthMeters / Math.max(0.001, sourceSize.x) : landmark.modelHeightMeters / Math.max(0.001, sourceSize.y),
    y: landmark.modelHeightMeters / Math.max(0.001, sourceSize.y),
    z: Number.isFinite(landmark.modelDepthMeters) ? landmark.modelDepthMeters / Math.max(0.001, sourceSize.z) : landmark.modelHeightMeters / Math.max(0.001, sourceSize.y)
  };
  root.scale.set(scale.x, scale.y, scale.z);
  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const world = appCtx.geoToWorld(landmark.lat, landmark.lon);
  const baseY = appCtx.elevationWorldYAtWorldXZ(world.x, world.z);
  root.position.add(new THREE.Vector3(world.x - center.x, baseY - bounds.min.y, world.z - center.z));
  root.updateMatrixWorld(true);
  return { world, baseY, scale };
}

function addEiffelAntenna(root, placement, landmark) {
  if (landmark.id !== 'eiffel-tower' || landmark.totalHeightMeters <= landmark.modelHeightMeters) return;
  const mastHeight = landmark.totalHeightMeters - landmark.modelHeightMeters;
  const geometry = new THREE.CylinderGeometry(0.45, 1.05, mastHeight, 10);
  const material = new THREE.MeshStandardMaterial({ color: landmark.color, roughness: 0.58, metalness: 0.42 });
  const mast = new THREE.Mesh(geometry, material);
  mast.position.set(0, landmark.modelHeightMeters + mastHeight * 0.5, 0);
  mast.castShadow = true;
  root.add(mast);
}

function hideGenericVisuals(landmark, world) {
  const candidates = [...(appCtx.buildingMeshes || []), ...(appCtx.historicMarkers || [])];
  for (const mesh of candidates) {
    if (!mesh || mesh.userData?.curatedLandmarkId) continue;
    let center = null;
    const footprint = mesh.userData?.footprint;
    if (Array.isArray(footprint) && footprint.length) {
      center = footprint.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
      center.x /= footprint.length;
      center.z /= footprint.length;
    } else if (mesh.position) {
      center = { x: mesh.position.x, z: mesh.position.z };
    }
    if (center && Math.hypot(center.x - world.x, center.z - world.z) <= landmark.hideRadiusMeters) mesh.visible = false;
  }
}

function loadModel(url) {
  return new Promise((resolve, reject) => {
    if (!THREE.GLTFLoader) {
      reject(new Error('GLTFLoader is unavailable'));
      return;
    }
    new THREE.GLTFLoader().load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

async function loadCuratedLandmark(landmark, isActiveLoadContext) {
  let model;
  if (landmark.builder === 'measured-eiffel-tower') model = createMeasuredEiffelTower();
  else if (landmark.builder === 'measured-elizabeth-tower') model = createMeasuredElizabethTower();
  else if (landmark.builder === 'measured-khufu-pyramid') model = createMeasuredKhufuPyramid();
  else model = await loadModel(landmark.modelUrl);
  if (!isActiveLoadContext?.()) {
    disposeModel(model);
    return null;
  }
  model.rotation.set(landmark.rotation.x, landmark.rotation.y, landmark.rotation.z);
  if (!landmark.preserveMaterials) colorizeModel(model, landmark);
  const root = new THREE.Group();
  root.add(model);
  root.name = `curated-landmark:${landmark.id}`;
  root.userData = {
    curatedLandmarkId: landmark.id,
    isHistoricLandmark: true,
    landmarkKind: 'curated_model',
    landmarkName: landmark.name,
    wikidata: landmark.wikidata,
    source: 'licensed-local-asset'
  };
  const placement = placeAtRealScale(root, landmark);
  addEiffelAntenna(root, placement, landmark);
  hideGenericVisuals(landmark, placement.world);
  appCtx.scene.add(root);
  appCtx.historicMarkers.push(root);
  appCtx.historicSites.push({
    x: placement.world.x,
    z: placement.world.z,
    type: 'curated_landmark',
    name: landmark.name,
    wikidata: landmark.wikidata,
    height: landmark.totalHeightMeters
  });
  const bounds = new THREE.Box3().setFromObject(root);
  let meshCount = 0;
  root.traverse((object) => { if (object.isMesh) meshCount += 1; });
  return {
    id: landmark.id,
    name: landmark.name,
    distanceMeters: Math.round(landmark.distanceMeters),
    meshCount,
    visible: root.visible,
    attached: root.parent === appCtx.scene,
    bounds: {
      min: bounds.min.toArray().map((value) => Number(value.toFixed(2))),
      max: bounds.max.toArray().map((value) => Number(value.toFixed(2)))
    }
  };
}

export async function renderCuratedLandmarkModels(options = {}) {
  if (typeof THREE === 'undefined') return { requested: 0, loaded: [], failed: [] };
  const landmarks = curatedLandmarksNear(appCtx.LOC);
  const loaded = [];
  const failed = [];
  for (const landmark of landmarks) {
    try {
      const result = await loadCuratedLandmark(landmark, options.isActiveLoadContext);
      if (result) loaded.push(result);
    } catch (error) {
      failed.push({ id: landmark.id, message: String(error?.message || error) });
    }
  }
  appCtx.curatedLandmarkMetrics = { requested: landmarks.length, loaded, failed };
  return appCtx.curatedLandmarkMetrics;
}
