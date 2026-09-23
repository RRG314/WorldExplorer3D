import {createRdtCaptureSelector} from './rdt-building-index.js';
import { buildingCenter } from './nearby-buildings.js';
import {readCaptureIntent,clearCaptureIntent} from './capture-intent.js';
import { listApprovedExteriorRepresentations } from '../../../js/community-reality-capture-api.js?v=4';
import { worldModificationIdentityForLocation } from '../editable-world/model.js?v=1';
import { setBuildingPresentationSuppressed } from '../editable-world/runtime.js?v=4';
import { runtimePublicationState } from './runtime-contract.js?v=2';
import { applyCaptureAlignment, photoWallVerticalScale } from './alignment.js?v=1';
import { createNearbyCaptureRefresh } from './nearby-refresh.js?v=1';

const MAX_RUNTIME_VERTICES = 1_500_000;
const instances = new Map();
let refreshSerial = 0;
const captureSelector=createRdtCaptureSelector();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}


function disposeObject(root) {
  root?.parent?.remove(root);
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

function publishCaptureEntryBuildings(appCtx) {
  // A photographed facade can cover a generated door elsewhere on the house.
  // Register a nearby-building interaction only while its reviewed visual exists.
  appCtx.communityRealityCaptureEntryBuildings = new Set([...instances.values()]
    .filter(instance => !instance.representationId.startsWith('local-survey:'))
    .map(instance => instance.sourceBuildingId));
}

function removeInstance(appCtx, representationId) {
  const instance = instances.get(representationId);
  if (!instance) return;
  instances.delete(representationId);
  publishCaptureEntryBuildings(appCtx);
  if(!instance.partial)setBuildingPresentationSuppressed(appCtx, instance.sourceBuildingId, false, 'community-reality-capture');
  disposeObject(instance.root);
}

export function clearCommunityRealityCapturePresentation(appCtx) {
  refreshSerial += 1;
  appCtx.captureNearbySelection = null;
  captureSelector.clear();
  [...instances.keys()].forEach((sourceBuildingId) => removeInstance(appCtx, sourceBuildingId));
  publishCaptureEntryBuildings(appCtx);
  appCtx.communityRealityCapturePresentation = Object.freeze({ worldId: '', approved: 0, loaded: 0, failed: 0 });
}

async function attachRepresentation(appCtx, representation, worldId, sequence, serial) {
  const sourceBuildingId = String(representation?.sourceBuildingId || '');
  const modelUrl = String(representation?.model?.url || '');
  const partial=representation.representationKind==='facade-patches';
  if (!sourceBuildingId || (!modelUrl&&!representation.localRoot) || instances.has(representation.representationId)) return false;
  const building = (appCtx.buildings || []).find((candidate) => String(candidate?.sourceBuildingId || '') === sourceBuildingId);
  if (!building) return false;
  if(partial){
    const center=buildingCenter(building),current=(building.pts||[]).map(p=>({x:p.x-center.x,z:p.z-center.z}));
    const saved=representation.footprint;
    if(!Array.isArray(saved)||current.length!==saved.length||saved.some(p=>!current.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<.15)))throw Error('Approved photo patches do not match the current mapped footprint.');
  }
  const root = representation.localRoot || await loadGlb(modelUrl);
  try {
    validateRuntimeModel(root);
    if (serial !== refreshSerial || sequence !== Number(appCtx._worldLoadSequence || 0) || worldId !== worldModificationIdentityForLocation(appCtx.LOC || {})) {
      disposeObject(root);
      return false;
    }
    const center = buildingCenter(building);
    const alignment = representation.alignment || {};
    const baseY = finite(building.baseY, finite(building.minY, appCtx.sampleFeatureSurfaceY?.(center.x, center.z)));
    applyCaptureAlignment(root, alignment, { x: center.x, y: baseY, z: center.z });
    if (partial) {
      root.scale.y = photoWallVerticalScale(building, representation.patchHeightMeters);
      root.updateMatrixWorld?.(true);
    }
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
      if(partial){object.castShadow=false;const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>{m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-2;});}
    });
    appCtx.scene.add(root);
    if(!partial)setBuildingPresentationSuppressed(appCtx, sourceBuildingId, true, 'community-reality-capture');
    instances.set(representation.representationId, { root, sourceBuildingId, partial, revision:representation.revision||0, representationId: representation.representationId });
    publishCaptureEntryBuildings(appCtx);
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
  const intent=readCaptureIntent();
  if(intent&&!appCtx._captureSignInResume){appCtx._captureSignInResume=true;void import('../../../js/auth-ui.js?v=56').then(async({getCurrentUser})=>{const user=getCurrentUser();if(!user||user.isAnonymous)return;const ui=await import('./ui.js?v=2');clearCaptureIntent();const target=intent.target,building=target&&(appCtx.buildings||[]).find(b=>b.sourceBuildingId===target.sourceBuildingId);if(building)await ui.openRealityCaptureForBuilding(appCtx,{id:building.sourceBuildingId,label:target.label,position:{x:buildingCenter(building).x,z:buildingCenter(building).z}});else await ui.openRealityCaptureLibrary(appCtx,target);}).catch(()=>{}).finally(()=>appCtx._captureSignInResume=false);}

  const serial = ++refreshSerial;
  try {
    let local=[];
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&localStorage.getItem('we3d-local-survey-present')){
      const {localSurveyRepresentations}=await import('./survey-presentation.js');
      local=await localSurveyRepresentations(appCtx,instances);
      const localIds=new Set(local.map(r=>r.representationId));
      for(const id of instances.keys())if(id.startsWith('local-survey:')&&!localIds.has(id))removeInstance(appCtx,id);
      const replaced=new Set(local.map(r=>r.sourceBuildingId));
      for(const [id,instance]of instances)if(!id.startsWith('local-survey:')&&replaced.has(instance.sourceBuildingId))removeInstance(appCtx,id);
      for(const r of local)if(!instances.has(r.representationId))await attachRepresentation(appCtx,r,worldId,sequence,serial);
    }
    const actor=appCtx.activeTransportActor?.()?.position||appCtx.Walk?.state?.walker||appCtx.car||{x:0,z:0};
    const selectionStarted=performance.now();
    const selection=captureSelector.select(appCtx.buildings || [],actor,appCtx._worldLoadSequence);
    const nearby=selection.ids;
    appCtx.captureNearbySelection={durationMs:performance.now()-selectionStarted,
      buildings:appCtx.buildings?.length || 0,selected:nearby.length,...selection.stats};
    const response = await listApprovedExteriorRepresentations(worldId,nearby);
    if(serial!==refreshSerial)return null;
    const localBuildings=new Set(local.map(r=>r.sourceBuildingId));
    const rows = Array.isArray(response?.representations) ? response.representations.filter(r=>!localBuildings.has(r.sourceBuildingId)) : [];
    const retained=new Set([...rows,...local].map(row=>row.representationId));
    for(const id of instances.keys())if(!retained.has(id))removeInstance(appCtx,id);
    let loaded = 0;
    let failed = 0;
    for (const representation of rows) {
      try {
        const previous=instances.get(representation.representationId);
        if(previous&&(previous.revision||0)!==(representation.revision||0))removeInstance(appCtx,representation.representationId);
        if (instances.has(representation.representationId)||await attachRepresentation(appCtx, representation, worldId, sequence, serial)) loaded += 1;
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
  if(appCtx._captureNearbyRefreshInstalled)return;
  appCtx._captureNearbyRefreshInstalled=true;
  const isLocal=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  // A saved survey URL must not unexpectedly replace the world with an editor.
  {
    const menu=document.getElementById('fCommunityBoard')?.parentElement;
    if(menu&&!document.getElementById('fPhotoSurvey')){
      const button=document.createElement('button');button.id='fPhotoSurvey';button.className='floatItem';button.type='button';button.textContent='Reality Capture · My contributions';
      button.onclick=async()=>{if(appCtx.getEnv?.()!=='EARTH')return;appCtx.closeAllFloatMenus?.();const {openRealityCaptureLibrary}=await import('./ui.js?v=2');await openRealityCaptureLibrary(appCtx);};menu.append(button);
    }
  }
  if(isLocal){
    window.addEventListener('we3d-local-survey-changed',()=>{void refreshCommunityRealityCapturePresentation(appCtx);});
    void import('../../../js/auth-ui.js?v=56').then(({observeAuth})=>observeAuth(()=>{
      for(const id of instances.keys())if(id.startsWith('local-survey:'))removeInstance(appCtx,id);
      if(appCtx.initialEarthWorldReady)void refreshCommunityRealityCapturePresentation(appCtx);
    }));
  }
  const update=createNearbyCaptureRefresh(()=>refreshCommunityRealityCapturePresentation(appCtx));
  appCtx.refreshNearbyCapturePresentation=()=>update(
    appCtx.activeTransportActor?.()?.position,performance.now(),appCtx._worldLoadSequence
  );
  appCtx.registerRuntimeSystem?.({
    id:'reality-capture.nearby',owner:'reality-capture',phase:'world',critical:false,
    enabled:()=>appCtx.gameStarted===true&&!appCtx.worldLoading&&appCtx.initialEarthWorldReady===true&&appCtx.getEnv?.()==='EARTH',
    update(frame){
      const position=appCtx.activeTransportActor?.()?.position;
      if(position)void update(position,frame.timestamp,appCtx._worldLoadSequence);
    }
  });
}
