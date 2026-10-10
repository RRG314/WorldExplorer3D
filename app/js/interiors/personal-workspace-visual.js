import {workspaceCollisionProxies} from '../campaign/personal-workspace.js';
import {detachSceneObject} from '../engine/scene-object-lifecycle.js';
import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';

// Owns only these two model leases, their proxies and the player's record card.
// The building shell, floor, doors and scene lighting keep their existing owner.
export async function createWorkspaceVisual(ctx,active,geometry,record,options={}) {
  const T=globalThis.THREE,group=new T.Group(),instances=[],resources=[],colliders=workspaceCollisionProxies(geometry);
  const owner=ctx.dynamicBuildingColliders,host=active.group;
  group.name='Personal research workspace';let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;detachSceneObject(group);instances.forEach(instance=>instance.dispose());resources.forEach(r=>r.dispose());
    for(const collider of colliders){const index=owner.indexOf(collider);if(index>=0)owner.splice(index,1);}
  };
  try {
    for (const part of geometry.parts) {
      const instance=await loadModelAsset(T,part.id,{signal:options.signal});instances.push(instance);
      if(options.isCurrent&&!options.isCurrent()){dispose();return null;}
      const bounds=new T.Box3().setFromObject(instance.root);
      // Keep original metre scale; only place the source's feet on the floor.
      instance.root.position.y-=bounds.min.y;
      const mount=new T.Group();mount.position.set(part.x,part.y,part.z);mount.rotation.y=part.yaw+(part.id==='workspace-chair'?Math.PI:0);mount.add(instance.root);group.add(mount);
      instance.root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    }
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;const c=canvas.getContext('2d');
    c.fillStyle='#f0e9d9';c.fillRect(0,0,512,384);c.fillStyle='#213842';c.font='bold 26px sans-serif';c.fillText('FIELD JOURNAL',28,52,456);
    c.font='20px sans-serif';
    const words=String(record?.name||'Your saved field record').split(/\s+/);let line='',row=0;
    for (const word of words){const next=line?`${line} ${word}`:word;if(c.measureText(next).width>448){c.fillText(line,28,106+row*28);row++;line=word;}else line=next;if(row>=5)break;}
    c.fillText(line,28,106+row*28,448);c.font='16px sans-serif';c.fillText(String(record?.regionLabel||'Personal research notes'),28,332,450);
    const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;
    const material=new T.MeshStandardMaterial({map:texture,roughness:.95,metalness:0}),paperGeometry=new T.PlaneGeometry(.44,.33);
    resources.push(texture,material,paperGeometry);
    const paper=new T.Mesh(paperGeometry,material);paper.rotation.x=-Math.PI/2;paper.rotation.z=-geometry.yaw;
    paper.position.set(geometry.origin.x,geometry.origin.y+.803,geometry.origin.z);group.add(paper);
    if(options.isCurrent&&!options.isCurrent()){dispose();return null;}
    host.add(group);owner.push(...colliders);
    return {group,geometry,dispose};
  }catch(error){dispose();if(error.name==='AbortError')return null;throw error;}
}
