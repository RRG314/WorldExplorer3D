import {compileLayout} from '../../../functions/interior-layout.mjs';

// Meshes and collision consumers share the same compiler output. Photos only
// decorate these surfaces; they never substitute a different collision shell.
export function buildAuthoredInterior(T,layout) {
  const compiled=compileLayout(layout),group=new T.Group();
  group.name='authored-home';group.userData.layoutId=layout.id;
  const wallMaterial=new T.MeshStandardMaterial({color:0xe4e0d5,roughness:1,side:T.DoubleSide});
  const floorMaterial=new T.MeshStandardMaterial({color:0xa9967c,roughness:1,side:T.DoubleSide});
  const ceilingMaterial=new T.MeshStandardMaterial({color:0xf0ece2,roughness:1,side:T.DoubleSide});
  for(const s of compiled.surfaces.filter(s=>s.kind!=='wall'))for(const polygon of s.polygons){
    const makePath=(ring,Path)=>{const p=new Path();ring.forEach(([x,z],i)=>i?p.lineTo(x,-z):p.moveTo(x,-z));p.closePath();return p;};
    const shape=makePath(polygon[0],T.Shape);shape.holes=polygon.slice(1).map(r=>makePath(r,T.Path));
    const mesh=new T.Mesh(new T.ShapeGeometry(shape),s.kind==='floor'?floorMaterial:ceilingMaterial);
    mesh.rotation.x=-Math.PI/2;mesh.position.y=s.y;mesh.userData.surfaceId=s.id;mesh.userData.roomId=s.roomId;mesh.userData.floorId=s.floorId;mesh.userData.kind=s.kind;group.add(mesh);
  }
  for(const s of compiled.solids){
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);
    const mesh=new T.Mesh(new T.BoxGeometry(length,s.top-s.bottom,s.thickness),wallMaterial);
    mesh.position.set((s.a.x+s.b.x)/2,(s.top+s.bottom)/2,(s.a.z+s.b.z)/2);mesh.rotation.y=-Math.atan2(s.b.z-s.a.z,s.b.x-s.a.x);
    mesh.userData.wallId=s.wallId;mesh.userData.floorId=s.floorId;mesh.userData.kind='wall';group.add(mesh);
  }
  for(const ramp of compiled.ramps){
    const run=Math.hypot(ramp.b.x-ramp.a.x,ramp.b.z-ramp.a.z),count=Math.max(2,Math.ceil((ramp.y1-ramp.y0)/.18));
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,top=ramp.y0+(ramp.y1-ramp.y0)*(i+1)/count;
      const step=new T.Mesh(new T.BoxGeometry(run/count,Math.max(.03,top-ramp.y0),ramp.width),floorMaterial);
      step.position.set(ramp.a.x+(ramp.b.x-ramp.a.x)*t,(ramp.y0+top)/2,ramp.a.z+(ramp.b.z-ramp.a.z)*t);step.rotation.y=-Math.atan2(ramp.b.z-ramp.a.z,ramp.b.x-ramp.a.x);step.userData.kind='stairs';group.add(step);
    }
  }
  return {group,compiled,dispose(){const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());group.parent?.remove(group);}};
}
