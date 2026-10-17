import {createRoadContactIndex} from '../terrain/road-contact-index.js?v=1';
const owners=new WeakMap();
export function facilitySurfaceFor(ctx){return owners.get(ctx)||null;}
export function publishFacilitySurface(ctx,root,meshes,cuts){
 clearFacilitySurface(ctx);
 const index=createRoadContactIndex(meshes),owner={root,index,cuts,sequence:ctx._worldLoadSequence};owners.set(ctx,owner);
 root.addEventListener('removed',()=>{if(owners.get(ctx)===owner)clearFacilitySurface(ctx);});return owner;
}
export function sampleFacilitySurface(ctx,x,z,currentY=NaN){
 const owner=owners.get(ctx);if(!owner||owner.sequence!==ctx._worldLoadSequence)return null;
 const y=owner.index.sampleAt(x,z,currentY);return Number.isFinite(y)?{y,source:'terrain',feature:null,dist:0,pt:{x,z}}:null;
}
export function clearFacilitySurface(ctx){owners.get(ctx)?.index.dispose();owners.delete(ctx);}
