import { listApprovedExteriorRepresentations } from '../../../js/community-reality-capture-api.js?v=3';
import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import { setBuildingPresentationSuppressed } from '../editable-world/runtime.js?v=4';
import { runtimePublicationState } from './runtime-contract.js?v=1';

const MAX_RUNTIME_VERTICES = 1_500_000;
const instances = new Map();
let refreshSerial = 0;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildingCenter(building) {
  if (Number.isFinite(building?.centerX) && Number.isFinite(building?.centerZ)) {
    return { x: building.centerX, z: building.centerZ };
  }
  const points = Array.isArray(building?.pts) ? building.pts : [];
  if (points.length) {
    return {
      x: points.reduce((sum, point) => sum + finite(point.x), 0) / points.length,
      z: points.reduce((sum, point) => sum + finite(point.z), 0) / points.length
    };
  }
  return {
    x: (finite(building?.minX) + finite(building?.maxX)) * 0.5,
    z: (finite(building?.minZ) + finite(building?.maxZ)) * 0.5
  };
}

function disposeObject(root) {
  root?.removeFromParent?.();
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach((key) => material[key]?.dispose?.());
      material.dispose?.();
    });
  });
}

function validateRuntimeModel(root) {
  let vertices = 0;
  let meshes = 0;
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    meshes += 1;
    vertices += Number(object.geometry?.attributes?.position?.count || 0);
  });
  if (!meshes || vertices > MAX_RUNTIME_VERTICES) throw new Error('Reviewed model exceeds the runtime geometry budget.');
  return { meshes, vertices };
}

function loadGlb(url) {
  return new Promise((resolve, reject) => {
    if (!globalThis.THREE?.GLTFLoader) return reject(new Error('GLTFLoader is unavailable.'));
    new globalThis.THREE.GLTFLoader().load(url, (gltf) => {
      const root = gltf?.scene || gltf?.scenes?.[0];
      if (!root) reject(new Error('Reviewed model has no scene.'));
      else resolve(root);
    }, undefined, reject);
  });
}

function removeInstance(appCtx, sourceBuildingId) {
  const instance = instances.get(sourceBuildingId);
  if (!instance) return;
  instances.delete(sourceBuildingId);
  setBuildingPresentationSuppressed(appCtx, sourceBuildingId, false, 'community-reality-capture');
  disposeObject(instance.root);
}

export function clearCommunityRealityCapturePresentation(appCtx) {
  refreshSerial += 1;
  [...instances.keys()].forEach((sourceBuildingId) => removeInstance(appCtx, sourceBuildingId));
  appCtx.communityRealityCapturePresentation = Object.freeze({ worldId: '', approved: 0, loaded: 0, failed: 0 });
}

async function attachRepresentation(appCtx, representation, worldId, sequence, serial) {
  const sourceBuildingId = String(representation?.sourceBuildingId || '');
  const modelUrl = String(representation?.model?.url || '');
  if (!sourceBuildingId || !modelUrl || instances.has(sourceBuildingId)) return false;
  const building = (appCtx.buildings || []).find((candidate) => String(candidate?.sourceBuildingId || '') === sourceBuildingId);
  if (!building) return false;
  const root = await loadGlb(modelUrl);
  try {
    validateRuntimeModel(root);
    if (serial !== refreshSerial || sequence !== Number(appCtx._worldLoadSequence || 0) || worldId !== worldModificationIdentityForLocation(appCtx.LOC || {})) {
      disposeObject(root);
      return false;
    }
    const center = buildingCenter(building);
    const alignment = representation.alignment || {};
    const offset = alignment.positionOffset || {};
    const baseY = finite(building.baseY, finite(building.minY, appCtx.sampleFeatureSurfaceY?.(center.x, center.z)));
    const scale = Math.max(0.05, Math.min(20, finite(alignment.scale, 1)));
    root.position.set(center.x + finite(offset.x), baseY + finite(offset.y), center.z + finite(offset.z));
    root.rotation.y = finite(alignment.rotationYDegrees) * Math.PI / 180;
    root.scale.setScalar(scale);
    root.userData.communityRealityCapture = Object.freeze({
      representationId: String(representation.representationId || ''),
      sourceBuildingId,
      presentationOnly: true,
      collisionAuthority: 'canonical-mapped-building'
    });
    root.traverse((object) => {
      if (!object?.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
    });
    appCtx.scene.add(root);
    setBuildingPresentationSuppressed(appCtx, sourceBuildingId, true, 'community-reality-capture');
    instances.set(sourceBuildingId, { root, representationId: representation.representationId });
    return true;
  } catch (error) {
    disposeObject(root);
    throw error;
  }
}

export async function refreshCommunityRealityCapturePresentation(appCtx) {
  const publication = runtimePublicationState(appCtx);
  if (!publication.enabled) {
    clearCommunityRealityCapturePresentation(appCtx);
    appCtx.communityRealityCapturePresentation = Object.freeze({
      worldId: '', approved: 0, loaded: 0, failed: 0, disabled: true, reason: publication.reason
    });
    return appCtx.communityRealityCapturePresentation;
  }
  const sequence = Number(appCtx._worldLoadSequence || 0);
  const worldId = worldModificationIdentityForLocation(appCtx.LOC || {});
  if (!worldId || !appCtx.initialEarthWorldReady) return null;
  clearCommunityRealityCapturePresentation(appCtx);
  const serial = ++refreshSerial;
  try {
    const response = await listApprovedExteriorRepresentations(worldId);
    const rows = Array.isArray(response?.representations) ? response.representations : [];
    let loaded = 0;
    let failed = 0;
    for (const representation of rows) {
      try {
        if (await attachRepresentation(appCtx, representation, worldId, sequence, serial)) loaded += 1;
      } catch (error) {
        failed += 1;
        console.warn('[RealityCapture] Approved exterior kept its procedural fallback:', error);
      }
    }
    if (serial !== refreshSerial) return null;
    const summary = Object.freeze({ worldId, approved: rows.length, loaded, failed });
    appCtx.communityRealityCapturePresentation = summary;
    return summary;
  } catch (error) {
    if (serial === refreshSerial) {
      appCtx.communityRealityCapturePresentation = Object.freeze({ worldId, approved: 0, loaded: 0, failed: 0, unavailable: true });
    }
    return null;
  }
}

export function installCommunityRealityCaptureRuntime(appCtx) {
  Object.assign(appCtx, {
    clearCommunityRealityCapturePresentation: () => clearCommunityRealityCapturePresentation(appCtx),
    refreshCommunityRealityCapturePresentation: () => refreshCommunityRealityCapturePresentation(appCtx)
  });
}
