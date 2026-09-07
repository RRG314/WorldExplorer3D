import {
  requestPrivateSpaceAccess,
  resolveBuildingInteriorRepresentation
} from '../../../js/community-reality-capture-api.js?v=3';
import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import {
  canonicalRoomId,
  resolveCanonicalMappedBuilding,
  runtimePublicationState
} from './runtime-contract.js?v=1';

const MAX_RUNTIME_VERTICES = 1_500_000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function resolveCommunityInteriorDefinition(appCtx, support, resolveFallback) {
  if (!runtimePublicationState(appCtx).enabled) return resolveFallback(support);
  const building = resolveCanonicalMappedBuilding(appCtx, support);
  const sourceBuildingId = String(building?.sourceBuildingId || '');
  const worldId = worldModificationIdentityForLocation(appCtx.LOC || {});
  if (!sourceBuildingId || !worldId) return resolveFallback(support);
  try {
    const roomId = canonicalRoomId(appCtx);
    const response = await resolveBuildingInteriorRepresentation(sourceBuildingId, worldId, roomId);
    if (!response?.available) return resolveFallback(support);
    if (!response.authorized) {
      return {
        accessDenied: true,
        label: response.label || 'Private Residence',
        reason: response.reason || 'private_residence',
        requestable: response.requestable === true,
        spaceId: response.spaceId || ''
      };
    }
    const fallback = await resolveFallback(support);
    return fallback ? { ...fallback, communityRealityCapture: response } : null;
  } catch (error) {
    if (error?.status === 403) {
      return {
        accessDenied: true,
        label: error.payload?.label || 'Private Residence',
        reason: error.payload?.reason || 'private_residence',
        requestable: error.payload?.requestable === true,
        spaceId: error.payload?.spaceId || ''
      };
    }
    // Provider or network failure never exposes a protected model. The normal
    // generated/mapped representation remains available as the baseline world.
    return resolveFallback(support);
  }
}

export async function requestCommunityInteriorAccess(appCtx, definition) {
  const spaceId = String(definition?.spaceId || '');
  const roomId = canonicalRoomId(appCtx);
  if (!definition?.requestable || !spaceId || !roomId) return false;
  await requestPrivateSpaceAccess(spaceId, roomId);
  return true;
}

function loadGlb(url) {
  return new Promise((resolve, reject) => {
    if (!globalThis.THREE?.GLTFLoader) return reject(new Error('GLTFLoader is unavailable.'));
    new globalThis.THREE.GLTFLoader().load(url, (gltf) => {
      const root = gltf?.scene || gltf?.scenes?.[0];
      if (!root) reject(new Error('Reviewed interior model has no scene.'));
      else resolve(root);
    }, undefined, reject);
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
  if (!meshes || vertices > MAX_RUNTIME_VERTICES) throw new Error('Reviewed interior exceeds the runtime geometry budget.');
}

function isInteractionVisual(object) {
  let current = object;
  while (current) {
    if (current.userData?.interactionKind) return true;
    current = current.parent;
  }
  return false;
}

export async function attachCommunityInteriorRepresentation(appCtx, active) {
  const representation = active?.definition?.communityRealityCapture;
  const modelUrl = String(representation?.model?.url || '');
  if (!modelUrl || !active?.group) return false;
  const expectedActive = active;
  try {
    const root = await loadGlb(modelUrl);
    validateRuntimeModel(root);
    if (appCtx.activeInterior !== expectedActive || active.group?.parent !== appCtx.scene) {
      root.traverse?.((object) => {
        if (!object?.isMesh) return;
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material?.dispose?.());
      });
      return false;
    }
    const alignment = representation.alignment || {};
    const offset = alignment.positionOffset || {};
    const scale = Math.max(0.05, Math.min(20, finite(alignment.scale, 1)));
    root.position.set(
      finite(active.center?.x) + finite(offset.x),
      finite(active.floorBaseY) + finite(offset.y),
      finite(active.center?.z) + finite(offset.z)
    );
    root.rotation.y = finite(alignment.rotationYDegrees) * Math.PI / 180;
    root.scale.setScalar(scale);
    root.userData.communityRealityCapture = Object.freeze({
      captureId: String(representation.captureId || ''),
      spaceId: String(representation.spaceId || ''),
      presentationOnly: true,
      collisionAuthority: 'generated-interior-proxy'
    });
    root.traverse((object) => {
      if (!object?.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
    });
    active.group.traverse((object) => {
      if (object?.isMesh && !isInteractionVisual(object)) object.visible = false;
    });
    active.group.add(root);
    active.communityRealityCaptureRoot = root;
    active.mode = 'community_capture';
    return true;
  } catch (error) {
    console.warn('[RealityCapture] Protected interior kept its generated fallback:', error);
    return false;
  }
}
