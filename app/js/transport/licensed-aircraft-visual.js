import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

export const LICENSED_AIRCRAFT_ASSETS = Object.freeze({
  'expedition-prop':'aircraft-cessna-172',
  'business-jet':'aircraft-falcon-10'
});

// The calling aircraft visual owns this scope. A retired world/aircraft cannot
// publish a late model; template textures and GPU resources use existing leases.
export function attachLicensedAircraftVisual(THREE, host, entry, options = {}) {
  const assetId=LICENSED_AIRCRAFT_ASSETS[entry.id];
  if(!assetId)return null;
  const scope=createLifecycleScope(`aircraft-visual:${entry.id}`), controller=new AbortController();
  scope.defer(()=>controller.abort(),'model-request');
  const ready=(async()=>{
    let instance;
    try {
      instance=await loadModelAsset(THREE,assetId,{signal:controller.signal});
      if(!scope.isActive()){instance.dispose();return false;}
      instance.root.position.y=-Number(options.groundOffset||0);
      host.add(instance.root);
      scope.defer(()=>instance.dispose(),'model-lease');
      host.userData.curatedAircraftAssetId=assetId;
      host.userData.originalUnbrandedDesign=false;
      host.userData.aircraftAssetStatus='ready';
      options.onReady?.();
      return true;
    } catch(error) {
      instance?.dispose();
      if(scope.isActive()) {
        host.userData.aircraftAssetStatus='fallback';
        if(error?.name!=='AbortError')console.warn('Aircraft model unavailable; keeping the built-in aircraft.',error);
      }
      return false;
    }
  })();
  host.userData.aircraftAssetStatus='loading';
  return Object.freeze({ready,dispose:()=>scope.dispose('aircraft-retired')});
}
