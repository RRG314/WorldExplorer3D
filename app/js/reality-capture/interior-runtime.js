import {prepareHomePhotoSurfaces} from './home-photo-surfaces.js';
import './capture-theme.js';
import {
  requestPrivateSpaceAccess,
  resolveBuildingInteriorRepresentation
} from '../../../js/community-reality-capture-api.js?v=4';
import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import { applyCaptureAlignment } from './alignment.js?v=1';
import {
  canonicalRoomId,
  resolveCanonicalMappedBuilding,
  runtimePublicationState
} from './runtime-contract.js?v=2';

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
    let response = await resolveBuildingInteriorRepresentation(sourceBuildingId, worldId, roomId);
    if(response?.selectionRequired){
      const dialog=document.createElement('dialog');dialog.className='realityCaptureDialog';dialog.setAttribute('aria-label','Choose an interior');
      const title=document.createElement('h2');title.textContent='Choose an interior';dialog.append(title);
      for(const [index,space] of response.spaces.entries()){const b=document.createElement('button');b.textContent=`${space.label} · ${index+1}`;b.onclick=()=>dialog.close(space.spaceId);dialog.append(b);}
      const cancel=document.createElement('button');cancel.textContent='Back outside';cancel.onclick=()=>dialog.close();dialog.append(cancel);document.body.append(dialog);dialog.showModal();
      const id=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));dialog.remove();
      if(!id)return {accessDenied:true,label:'Interior selection cancelled',reason:'cancelled',requestable:false};
      response=await resolveBuildingInteriorRepresentation(sourceBuildingId,worldId,roomId,id);
    }
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
    if(representation.representationKind==='home-layout')applyCaptureAlignment(root,{},{});
    else applyCaptureAlignment(root, alignment, { x: finite(active.center?.x), y: finite(active.floorBaseY), z: finite(active.center?.z) });
    root.userData.communityRealityCapture = Object.freeze({
      captureId: String(representation.captureId || ''),
      spaceId: String(representation.spaceId || ''),
      presentationOnly: true,
      collisionAuthority: representation.representationKind==='home-layout'?'authored-layout':'generated-interior-proxy'
    });
    if(representation.representationKind==='home-layout')prepareHomePhotoSurfaces(root,representation.layout);
    root.traverse((object) => {
      if (!object?.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
      if(representation.representationKind==='home-layout'){
        for(const material of Array.isArray(object.material)?object.material:[object.material]){material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-2;}
      }
    });
    if(representation.representationKind!=='home-layout')active.group.traverse((object) => {
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
