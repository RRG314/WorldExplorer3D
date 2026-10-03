// Authored game presentation along the existing west-promenade walk. This is
// visual dressing, not a survey of Baltimore's paving, trees or furniture.
import {HARBOR_WALK} from '../activity-discovery/harbor-walk.js';
const STOPS = HARBOR_WALK.stops.map(p=>[p.lat,p.lon]);
export function harborDistrictFocus(ctx){
  const loc=ctx.LOC,scale=Number(ctx.SCALE);
  if(!Number.isFinite(loc?.lat)||!Number.isFinite(loc?.lon)||!Number.isFinite(scale)||scale<=0||Math.hypot((loc.lat-39.285)*111320,(loc.lon+76.6124)*86000)>1800)return null;
  return {x:(-76.6124-loc.lon)*scale*Math.cos(loc.lat*Math.PI/180),z:(loc.lat-39.285)*scale};
}
export function harborDistrictPlan(ctx) {
  const loc=ctx.LOC,scale=Number(ctx.SCALE);
  if(!Number.isFinite(loc?.lat)||!Number.isFinite(loc?.lon)||!Number.isFinite(scale)||scale<=0||Math.hypot((loc.lat-39.285)*111320,(loc.lon+76.6124)*86000)>1800)return null;
  const points=STOPS.map(([lat,lon])=>({x:(lon-loc.lon)*scale*Math.cos(loc.lat*Math.PI/180),z:(loc.lat-lat)*scale}));
  const height=(x,z)=>ctx.terrainMeshHeightAt?.(x,z) ?? ctx.elevationWorldYAtWorldXZ?.(x,z);
  const safe=(x,z,r=.4)=>{
    const y=height(x,z);if(!Number.isFinite(y)||ctx.isPointInsideWaterFootprint?.(x,z)===true)return null;
    if(ctx.checkBuildingCollision?.(x,z,r,{actorBaseY:y,actorHeight:2})?.collision)return null;
    const road=ctx.findNearestRoad?.(x,z);
    if(road?.road&&Number(road.dist)<Math.max(3,Number(road.road.width)||6)*.5+1)return null;
    return {x,y,z};
  };
  // Adjacent strips share the same mitered cross-section at a bend. Separate
  // rectangles otherwise leave a visible triangular gap outside the corner.
  const sections=points.map((p,index)=>{
    const normal=(a,b)=>{const n=Math.hypot(b.x-a.x,b.z-a.z);return {x:-(b.z-a.z)/n,z:(b.x-a.x)/n}};
    const a=normal(points[Math.max(0,index-1)],points[index===0?1:index]);
    const b=normal(points[index===points.length-1?index-1:index],points[Math.min(points.length-1,index+1)]);
    const length=Math.hypot(a.x+b.x,a.z+b.z),x=(a.x+b.x)/length,z=(a.z+b.z)/length;
    const factor=1/Math.max(.5,x*b.x+z*b.z);return {x:x*factor,z:z*factor};
  });
  const tiles=[],benches=[],lamps=[],trees=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z),fx=(b.x-a.x)/length,fz=(b.z-a.z)/length,nx=-fz,nz=fx;
    const at=(along,side)=>({x:a.x+fx*along+nx*side,z:a.z+fz*along+nz*side});
    const pavedAt=(along,side)=>{const t=along/length,n0=sections[i-1],n1=sections[i];return {x:a.x+fx*along+(n0.x+(n1.x-n0.x)*t)*side,z:a.z+fz*along+(n0.z+(n1.z-n0.z)*t)*side}};
    for(let d=0;d<length;d+=1){
      const end=Math.min(length,d+1);
      if(end-d<1e-5)continue;
      for(let side=-4;side<4;side+=2){
        const corners=[[d,side],[end,side],[end,side+2],[d,side+2]].map(([q,s])=>{const p=pavedAt(q,s);return safe(p.x,p.z)});
        const middle=pavedAt((d+end)/2,side+1);
        if(corners.some(p=>!p)||!safe(middle.x,middle.z))continue;
        if(Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))>.55)continue;
        tiles.push(corners);
      }
    }
    for(let d=10;d<length-5;d+=24){
      for(const [list,side,along] of [[benches,5.7,d],[lamps,-5.7,d],[trees,8,d+8]]){
        const p=at(along,side),support=safe(p.x,p.z,list===trees?1.5:1.2);
        if(support)list.push({...support,yaw:Math.atan2(fx,fz),target:at(along,0)});
      }
    }
  }
  return tiles.length?{tiles,benches,lamps,trees,sourceClaim:'authored-game-dressing'}:null;
}

function pavingTexture(THREE) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#71675b';c.fillRect(0,0,256,256);
  for(let row=0;row<16;row++)for(let col=-1;col<8;col++){
    const n=((row*37+col*13+221)%19),x=col*40+(row%2)*20;
    c.fillStyle=`rgb(${139+n},${122+n},${102+n})`;c.fillRect(x+1,row*16+1,38,14);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.encoding=THREE.sRGBEncoding;return texture;
}
export function publishHarborDistrict(ctx,{THREE,registerLamp}) {
  if(ctx.harborDistrictPresentation && ctx.harborDistrictPresentation.sequence===ctx._worldLoadSequence)return;
  const plan=harborDistrictPlan(ctx);if(!plan)return;
  const center=plan.tiles[Math.floor(plan.tiles.length/2)][0],root=new THREE.Group();root.name='Inner Harbor authored promenade';root.position.set(center.x,0,center.z);
  root.userData={furnitureKind:'district',sourceClaim:plan.sourceClaim};
  const positions=[],uv=[];
  for(const corners of plan.tiles)for(const index of [0,2,1,0,3,2]){const p=corners[index];positions.push(p.x-center.x,p.y+.045,p.z-center.z);uv.push(p.x/4,p.z/4);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const floor=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:pavingTexture(THREE),roughness:.94,metalness:0,side:THREE.DoubleSide}));floor.receiveShadow=true;root.add(floor);
  const wood=new THREE.MeshStandardMaterial({color:0x71503a,roughness:.87}),metal=new THREE.MeshStandardMaterial({color:0x343f42,roughness:.63,metalness:.35});
  const box=(group,w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const colliders=[];
  for(const p of plan.benches){
    const bench=new THREE.Group();bench.position.set(p.x-center.x,p.y,p.z-center.z);bench.rotation.y=p.yaw;
    for(let j=0;j<5;j++)box(bench,1.9,.065,.09,0,.48,-.25+j*.11,wood);
    for(let j=0;j<3;j++)box(bench,1.9,.105,.065,0,.68+j*.13,.29,wood);
    for(const x of [-.72,.72]){box(bench,.07,.5,.48,x,.25,0,metal);box(bench,.07,.56,.07,x,.72,.29,metal);}
    root.add(bench);
    // Conservative box participates in the existing dynamic-building query.
    colliders.push({minX:p.x-1.1,maxX:p.x+1.1,minZ:p.z-1.1,maxZ:p.z+1.1,minY:p.y,maxY:p.y+1.15,height:1.15,baseY:p.y,collisionKind:'solid',sourceBuildingId:'authored-harbor-bench'});
  }
  // Flatten the few static benches to preserve a small draw budget.
  root.updateMatrixWorld(true);
  const batches=new Map();for(const bench of root.children.filter(o=>o.isGroup))for(const mesh of bench.children){mesh.updateWorldMatrix(true,false);const g=mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld));const list=batches.get(mesh.material)||[];list.push(g);batches.set(mesh.material,list);mesh.geometry.dispose();}
  for(const bench of root.children.filter(o=>o.isGroup))root.remove(bench);
  for(const [material,geometries] of batches){const pos=[],norm=[];for(const source of geometries){const g=source.toNonIndexed();pos.push(...g.attributes.position.array);norm.push(...g.attributes.normal.array);g.dispose();source.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));root.add(new THREE.Mesh(g,material));}
  if(!plan.benches.length){wood.dispose();metal.dispose();}
  ctx.addEarthWorldObject(root);ctx.streetFurnitureMeshes.push(root);ctx.dynamicBuildingColliders.push(...colliders);
  for(const p of plan.lamps){
    const lamp=new THREE.Group();lamp.position.set(p.x,p.y,p.z);lamp.userData={furnitureKind:'street_lamp',sourceClaim:plan.sourceClaim};
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.065,.11,4.8,8),new THREE.MeshStandardMaterial({color:0x384144,roughness:.68,metalness:.4}));pole.position.y=2.4;lamp.add(pole);
    const head=new THREE.Mesh(new THREE.CylinderGeometry(.38,.27,.16,12),ctx.streetLampHeadMaterial);head.position.y=4.8;lamp.add(head);
    ctx.addEarthWorldObject(lamp);ctx.streetFurnitureMeshes.push(lamp);registerLamp(lamp,head,p.target);
  }
  ctx.harborDistrictPlanting=plan.trees;
  ctx.scheduleWorldCoverVegetationRefresh?.();
  ctx.harborDistrictPresentation={sequence:ctx._worldLoadSequence,tiles:plan.tiles.length,benches:plan.benches.length,lamps:plan.lamps.length,trees:plan.trees.length,sourceClaim:plan.sourceClaim};
}
