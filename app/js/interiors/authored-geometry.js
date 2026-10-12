import {compileLayout} from '../../../functions/interior-layout.mjs';

// Meshes and collision consumers share the same compiler output. Photos only
// decorate these surfaces; they never substitute a different collision shell.
export function buildAuthoredInterior(T,layout) {
  const compiled=compileLayout(layout),group=new T.Group();
  group.name='authored-home';group.userData.layoutId=layout.id;
  const wallMaterial=new T.MeshStandardMaterial({color:0xe4e0d5,roughness:1,side:T.DoubleSide});
  const floorMaterial=new T.MeshStandardMaterial({color:0xa9967c,roughness:1,side:T.DoubleSide});
  const ceilingMaterial=new T.MeshStandardMaterial({color:0xf0ece2,roughness:1,side:T.DoubleSide});
  const joineryMaterial=new T.MeshStandardMaterial({color:0x46585b,roughness:.4,metalness:.65});
  const liftDoorMaterial=new T.MeshStandardMaterial({color:0x9da8ab,roughness:.34,metalness:.78});
  // BoxGeometry's default UVs stretch one image over every wall, regardless of
  // length. Project in construction units so materials retain a consistent size.
  const metricBox=(w,h,d)=>{const g=new T.BoxGeometry(w,h,d),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i),Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i));return g;};
  const box=(w,h,d,material,x,y,z,yaw,kind)=>{const m=new T.Mesh(metricBox(w,h,d),material);m.position.set(x,y,z);m.rotation.y=yaw;m.userData.kind=kind;group.add(m);return m;};
  let glassMaterial=null,frameMaterial=null;
  for(const s of compiled.surfaces.filter(s=>s.kind!=='wall'))for(const polygon of s.polygons){
    const makePath=(ring,Path)=>{const p=new Path();ring.forEach(([x,z],i)=>i?p.lineTo(x,-z):p.moveTo(x,-z));p.closePath();return p;};
    const shape=makePath(polygon[0],T.Shape);shape.holes=polygon.slice(1).map(r=>makePath(r,T.Path));
    const depth=s.kind==='floor'?s.thickness||.15:0;
    const geometry=depth?new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1}):new T.ShapeGeometry(shape);
    const mesh=new T.Mesh(geometry,s.kind==='floor'?floorMaterial:ceilingMaterial);
    mesh.rotation.x=-Math.PI/2;mesh.position.y=s.y-depth;mesh.userData.surfaceId=s.id;mesh.userData.roomId=s.roomId;mesh.userData.floorId=s.floorId;mesh.userData.kind=s.kind;group.add(mesh);
  }
  for(const s of compiled.solids){
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);
    const glazed=['glazed','guard'].includes(s.presentation);
    if(glazed){
      glassMaterial ||= new T.MeshStandardMaterial({color:0x89bdc6,roughness:.16,metalness:.15,transparent:true,opacity:.11,depthWrite:false,side:T.DoubleSide});
      frameMaterial ||= new T.MeshStandardMaterial({color:0x46585b,roughness:.4,metalness:.65});
    }
    const mesh=new T.Mesh(metricBox(length,s.top-s.bottom,s.thickness),glazed?glassMaterial:wallMaterial);
    mesh.position.set((s.a.x+s.b.x)/2,(s.top+s.bottom)/2,(s.a.z+s.b.z)/2);mesh.rotation.y=-Math.atan2(s.b.z-s.a.z,s.b.x-s.a.x);
    mesh.userData.wallId=s.wallId;mesh.userData.floorId=s.floorId;mesh.userData.kind='wall';group.add(mesh);
    if(glazed){
      mesh.userData.glazing=true;
      for(const [height,y,material] of [[Math.max(.08,s.sill),s.bottom+Math.max(.08,s.sill)/2,wallMaterial],[.06,s.top-.03,frameMaterial]]){
        const trim=new T.Mesh(new T.BoxGeometry(length,height,.16),material);trim.position.set(mesh.position.x,y,mesh.position.z);trim.rotation.y=mesh.rotation.y;trim.userData.kind='glazing-frame';trim.userData.floorId=s.floorId;trim.userData.wallId=s.wallId;group.add(trim);
      }
      if(s.presentation==='glazed'&&length>4){
        const count=Math.ceil(length/1.65);
        for(let i=0;i<=count;i++){const t=i/count,m=box(.065,s.top-s.bottom,.16,frameMaterial,s.a.x+(s.b.x-s.a.x)*t,(s.bottom+s.top)/2,s.a.z+(s.b.z-s.a.z)*t,mesh.rotation.y,'glazing-frame');m.userData.floorId=s.floorId;m.userData.wallId=s.wallId;}
      }
    }
  }
  // Frame the already compiled clear opening. Jambs and heads sit outside the
  // aperture; they do not reduce its usable width or add an invisible threshold.
  for(const opening of compiled.openings){
    const dx=(opening.b.x-opening.a.x)/opening.width,dz=(opening.b.z-opening.a.z)/opening.width,yaw=-Math.atan2(dz,dx),x=(opening.a.x+opening.b.x)/2,z=(opening.a.z+opening.b.z)/2;
    for(const side of [-1,1]){const m=box(.09,opening.height,opening.thickness+.06,joineryMaterial,x+dx*side*(opening.width/2+.045),(opening.bottom+opening.top)/2,z+dz*side*(opening.width/2+.045),yaw,'door-frame');m.userData.openingId=opening.id;}
    const head=box(opening.width+.18,.09,opening.thickness+.06,joineryMaterial,x,opening.top+.045,z,yaw,'door-frame');head.userData.openingId=opening.id;
  }
  // Lift panels are seated against a compiler-owned, closed physical core.
  // The current interaction transfers the player between verified landings;
  // it does not pretend that a continuously simulated cabin exists.
  for(const core of compiled.cores)for(const stop of core.stops){
    const floor=layout.floors.find(f=>f.id===stop.floorId),{doorWidth:w,doorHeight:h}=core.shaft,{front,forward:f,right:r}=core;
    const face=(side,y,depth)=>({x:front.x+r.x*side+f.x*depth,y:floor.elevation+y,z:front.z+r.z*side+f.z*depth});
    const part=(width,height,depth,mat,side,y,offset,kind)=>{const p=face(side,y,offset);return box(width,height,depth,mat,p.x,p.y,p.z,stop.yaw,kind);};
    for(const side of [-1,1]){
      part(w/2-.008,h,.045,liftDoorMaterial,side*(w/4+.004),h/2,.08,'lift-door');
      part(.09,h+.1,.09,joineryMaterial,side*(w/2+.045),h/2,.09,'lift-frame');
    }
    part(w+.18,.12,.1,joineryMaterial,0,h+.06,.09,'lift-frame');
    part(.12,.25,.055,joineryMaterial,w/2+.23,1.1,.095,'lift-controls');
  }
  for(const ramp of compiled.ramps){
    const run=Math.hypot(ramp.b.x-ramp.a.x,ramp.b.z-ramp.a.z),count=Math.max(2,Math.ceil((ramp.y1-ramp.y0)/.18));
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,top=ramp.y0+(ramp.y1-ramp.y0)*(i+1)/count;
      const step=new T.Mesh(new T.BoxGeometry(run/count,Math.max(.03,top-ramp.y0),ramp.width),floorMaterial);
      step.position.set(ramp.a.x+(ramp.b.x-ramp.a.x)*t,(ramp.y0+top)/2,ramp.a.z+(ramp.b.z-ramp.a.z)*t);step.rotation.y=-Math.atan2(ramp.b.z-ramp.a.z,ramp.b.x-ramp.a.x);step.userData.kind='stairs';group.add(step);
    }
  }
  return {group,compiled,dispose(){const materials=new Set([joineryMaterial,liftDoorMaterial]);group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());group.parent?.remove(group);}};
}
