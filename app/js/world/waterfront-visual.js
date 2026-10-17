import {engineeredWaterfrontFor} from './engineered-waterfront.js';
import {resolveWaterBodySurfaceY} from './water-body-contract.js?v=4';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {pointInWaterBody} from './water-surface-registry.js?v=3';
import {applyTerrainPortalMasksForContext} from '../terrain/structure-terrain-portals.js?v=2';

export function publishWaterfrontWalls(ctx,THREE){
  const owner=engineeredWaterfrontFor(ctx);
  if(!owner||owner.rendered)return;
  owner.rendered=true;
  if(!owner.segments.length)return;
  const root=new THREE.Group();root.name='Engineered waterfront';
  const concrete=new THREE.MeshStandardMaterial({color:0x777b77,roughness:.93,metalness:0});
  const cap=new THREE.MeshStandardMaterial({color:0xaaa797,roughness:.88,metalness:0});
  concrete.color.convertSRGBToLinear();cap.color.convertSRGBToLinear();
  const colliders=[];
  const cuts=[];
  for(const [i,s] of owner.segments.entries()){
    const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2;
    const surface=resolveWaterBodySurfaceY(s.area,x,z,{terrainHeightAt:ctx.elevationWorldYAtWorldXZ});
    if(!Number.isFinite(surface))continue;
    const topAt=p=>Math.max(surface+.55,Number(ctx.terrainMeshHeightAt?.(p.x+s.nx*2,p.z+s.nz*2) ?? ctx.elevationWorldYAtWorldXZ?.(p.x+s.nx*2,p.z+s.nz*2))||surface+.8);
    const ay=topAt(s.a),by=topAt(s.b),bottom=surface-4;
    const pos=[];
    const a=[s.a.x,ay,s.a.z],b=[s.b.x,by,s.b.z],c=[s.b.x,bottom,s.b.z],d=[s.a.x,bottom,s.a.z];
    for(const p of [a,b,d,b,c,d,d,b,a,d,c,b])pos.push(...p);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
    const wall=new THREE.Mesh(g,concrete);wall.receiveShadow=true;root.add(wall);
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);
    // A coarse DEM cell straddles the bank and otherwise draws a beach in
    // front of the wall. Share the existing bounded terrain-cut authority
    // with tunnel portals; do not flatten or cut the dry promenade/roads.
    let width=12;
    const wet=(p,d)=>pointInWaterBody(s.area,p.x-s.nx*d,p.z-s.nz*d);
    while(width>=1&&!([s.a,s.b].every(p=>wet(p,.05)&&wet(p,width))))width*=.5;
    if(width>=1){
      const bedY=surface-3;
      cuts.push({kind:'quay',x:x-s.nx*width/2,z:z-s.nz*width/2,tangentX:(s.b.x-s.a.x)/length,tangentZ:(s.b.z-s.a.z)/length,halfWidth:width/2,halfDepth:length/2,roadY:bedY,grade:0,cutHeight:Math.max(ay,by)+1-bedY});
      const pts=[s.a,s.b,{x:s.b.x-s.nx*width,z:s.b.z-s.nz*width},{x:s.a.x-s.nx*width,z:s.a.z-s.nz*width}];
      const bed=new THREE.BufferGeometry();bed.setAttribute('position',new THREE.Float32BufferAttribute([0,2,1,0,3,2].flatMap(i=>[pts[i].x,bedY,pts[i].z]),3));bed.computeVertexNormals();root.add(new THREE.Mesh(bed,concrete));
    }
    const coping=new THREE.Mesh(new THREE.BoxGeometry(length,.16,.42),cap);
    coping.position.set(x,(ay+by)/2+.03,z);coping.rotation.y=-Math.atan2(s.b.z-s.a.z,s.b.x-s.a.x);coping.rotation.z=Math.atan2(by-ay,length);coping.receiveShadow=true;root.add(coping);
    const pts=[{x:s.a.x-s.nx*.18,z:s.a.z-s.nz*.18},{x:s.b.x-s.nx*.18,z:s.b.z-s.nz*.18},
      {x:s.b.x+s.nx*.18,z:s.b.z+s.nz*.18},{x:s.a.x+s.nx*.18,z:s.a.z+s.nz*.18}];
    colliders.push({pts,minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minZ:Math.min(...pts.map(p=>p.z)),maxZ:Math.max(...pts.map(p=>p.z)),minY:bottom,maxY:Math.max(ay,by)+.11,baseY:bottom,height:Math.max(ay,by)+.11-bottom,collisionKind:'solid',sourceBuildingId:`waterfront-quay:${i}`,geometrySource:'compiled_transport_structures'});
  }
  batchOwnedStaticStructure(THREE,root);
  root.userData={furnitureKind:'waterfront',sourceClaim:'mapped-shoreline-with-reviewed-bank-treatment'};
  const bounds=new THREE.Box3().setFromObject(root);
  root.userData.furnitureWorldBounds={minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z};
  ctx.addEarthWorldObject(root);ctx.streetFurnitureMeshes.push(root);ctx.dynamicBuildingColliders.push(...colliders);
  owner.terrainCuts=cuts;
  applyTerrainPortalMasksForContext(ctx,ctx.structureTerrainPortalDescriptors||[]);
  ctx.clearTerrainHeightCache?.();
}
