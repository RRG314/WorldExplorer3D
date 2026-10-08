import {batchStaticVesselParts} from '../transport/batch-static-vessel-parts.js';

// Original interpretive model for the reviewed Constellation footprint. It
// depicts the museum's furled rig, not a surveyed reconstruction or a new hull.
export function addMuseumSailingRig(THREE, vessel, {points, centerX, centerZ, deckY}) {
  const unique = points.filter((p, i) => i === 0 || Math.hypot(p.x-points[0].x,p.z-points[0].z) > .01);
  let xx=0, zz=0, xz=0;
  for(const p of unique){const x=p.x-centerX,z=p.z-centerZ;xx+=x*x;zz+=z*z;xz+=x*z;}
  const angle=.5*Math.atan2(2*xz,xx-zz), fx=Math.cos(angle), fz=Math.sin(angle);
  const along=unique.map(p=>(p.x-centerX)*fx+(p.z-centerZ)*fz);
  const across=unique.map(p=>-(p.x-centerX)*fz+(p.z-centerZ)*fx);
  const length=Math.max(...along)-Math.min(...along), width=Math.max(...across)-Math.min(...across);
  if(!Number.isFinite(length)||length<18||width<2)return null;
  const group=new THREE.Group();group.name='Museum sailing rig';
  const wood=new THREE.MeshStandardMaterial({color:0x82603b,roughness:.86});
  const cream=new THREE.MeshStandardMaterial({color:0xd2cab4,roughness:.94});
  const dark=new THREE.MeshStandardMaterial({color:0x242a2a,roughness:.84});
  const rope=new THREE.LineBasicMaterial({color:0x60533e});
  const pos=(a,b,y)=>new THREE.Vector3(centerX+fx*a-fz*b,y,centerZ+fz*a+fx*b);
  const lines=[];
  const line=(a,b)=>lines.push(a.x,a.y,a.z,b.x,b.y,b.z);
  function spar(a,b,r,material=wood){const delta=b.clone().sub(a),m=new THREE.Mesh(new THREE.CylinderGeometry(r*.78,r,delta.length(),8),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());m.castShadow=true;group.add(m);}
  for(const [index,a] of [-.27,0,.27].entries()){
    const station=a*length,height=length*(index===1?.55:index===0?.48:.42),top=pos(station,0,deckY+height);
    spar(pos(station,0,deckY),top,.24);
    for(const level of [.39,.62,.81]){
      const span=width*(1.7-level),y=deckY+height*level;
      spar(pos(station,-span,y),pos(station,span,y),.10);
      // Furled canvas keeps the museum silhouette open to the waterfront.
      spar(pos(station,-span*.9,y+.16),pos(station,span*.9,y+.16),.17,cream);
      line(top,pos(station,-span,y));line(top,pos(station,span,y));
    }
    for(const side of [-1,1])for(const offset of [-.045,0,.045]){
      line(pos(station+length*offset,side*width*.4,deckY+.35),pos(station,0,deckY+height*.65));
    }
    line(top,pos(-length*.47,0,deckY+.2));line(top,pos(length*.47,0,deckY+.2));
  }
  spar(pos(-length*.41,0,deckY+.5),pos(-length*.65,0,deckY+3),.22);
  // Outline follows the actual mapped hull; no rectangular rail crosses it.
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],p=new THREE.Vector3(a.x,deckY+.85,a.z),q=new THREE.Vector3(b.x,deckY+.85,b.z);
    spar(p,q,.055,dark);spar(new THREE.Vector3(a.x,deckY,a.z),p,.045,dark);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  group.add(new THREE.LineSegments(geometry,rope));
  const batches=batchStaticVesselParts(THREE,group);
  group.userData={museumRig:true,sourceClaim:'original-interpretive-model',mastCount:3,length,width,batches};
  vessel.add(group);return group;
}
