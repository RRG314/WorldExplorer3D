import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {COMMON_DOLPHIN} from './cetacean-rules.js';

export async function loadDolphinVisual(THREE,{signal,phase=0}={}) {
  const asset=await loadModelAsset(THREE,COMMON_DOLPHIN.assetId,{signal});
  let mixer;
  try {
    if(asset.animations.length!==1)throw Error('Common dolphin swimming animation is unavailable.');
    mixer=new THREE.AnimationMixer(asset.root);
    const action=mixer.clipAction(asset.animations[0]);action.play();action.time=phase%action.getClip().duration;mixer.update(0);
    // r128 cannot cull skinned bounds from their current pose. Three small,
    // admitted animals are bounded by the habitat owner instead.
    asset.root.traverse(node=>{if(node.isMesh){node.castShadow=false;node.frustumCulled=false;}});
    let disposed=false;
    return {root:asset.root,update(dt){if(!disposed&&dt>0)mixer.update(dt);},
      dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(asset.root);asset.dispose();}};
  }catch(error){mixer?.stopAllAction();mixer?.uncacheRoot(asset.root);asset.dispose();throw error;}
}
