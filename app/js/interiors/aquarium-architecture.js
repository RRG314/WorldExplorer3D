import {compileLayout,roomRing,pointInRoom} from '../../../functions/interior-layout.mjs';

// Venue-specific architectural assemblies over the shared structural/collision
// shell. The public route and opening positions remain owned by the layout.
export function buildAquariumArchitecture(T,{root,plan,layout,box,addWallCollider,materials}){
 const {concrete,metal,dark,ceiling,diffuser,carpet}=materials,k=1/plan.metersPerUnit,local=plan.local,yaw=Math.atan2(.75,.66),compiled=compileLayout(layout);
 const part=(mat,u,v,y,w,h,d)=>{const p=local(u,v);box(mat,p.x,y*k,p.z,w*k,h*k,d*k,yaw);};
 const line=(mat,a,b,y,h,d)=>{const len=Math.hypot(b.x-a.x,b.z-a.z);box(mat,(a.x+b.x)/2,y,(a.z+b.z)/2,len,h,d,-Math.atan2(b.z-a.z,b.x-a.x));};
 const front=plan.viewing.points.map(p=>local(...p)),floor=layout.floors.find(f=>f.id==='reef-m');
 // Tank acrylic is a continuous sheet, not a row of overlapping glass boxes.
 // Individual flat panes retain separate concrete piers from the same layout.
 const glassMaterial=new T.MeshStandardMaterial({color:0xd5eef0,roughness:.09,metalness:.04,transparent:true,opacity:.035,depthWrite:false,side:T.DoubleSide});
 const abandoned=new Set();
 root.traverse(o=>{if(!o.isMesh)return;
  if(o.userData.floorId===floor.id&&(o.userData.glazing||o.userData.kind==='glazing-frame')){o.visible=false;abandoned.add(o);}
  if(o.userData.kind==='floor'&&['underwater','overlook','reef-corridor','orientation'].includes(o.userData.roomId))o.material=carpet;
 });
 const used=new Set();root.traverse(o=>{if(o.isMesh&&!abandoned.has(o))for(const m of [].concat(o.material))used.add(m);});
 const unused=new Set();for(const o of abandoned){o.parent.remove(o);o.geometry.dispose();for(const m of [].concat(o.material))if(!used.has(m))unused.add(m);}unused.forEach(m=>m.dispose());
 function pane(points,name){
  const positions=[],indices=[];for(const p of points)positions.push(p.x,floor.elevation+.12*k,p.z,p.x,floor.elevation+floor.height-.08*k,p.z);
  for(let i=0;i<points.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new T.Mesh(g,glassMaterial);mesh.name=name;mesh.userData.kind='aquarium-viewing-acrylic';root.add(mesh);
  for(let i=0;i<points.length-1;i++){
   line(dark,points[i],points[i+1],floor.elevation+.06*k,.12*k,.42*k);
   line(dark,points[i],points[i+1],floor.elevation+floor.height-.06*k,.12*k,.44*k);
   // Concrete gallery edge projects into the tank, with a dark recessed reveal.
   line(concrete,points[i],points[i+1],8.02*k,.38*k,.7*k);
  }
 }
 pane(front.slice(plan.viewing.curvedStart,plan.viewing.curvedEnd+1),'reef-continuous-curved-acrylic');
 for(const i of plan.viewing.flatEdges)pane([front[i],front[i+1]],`reef-flat-viewing-pane-${i}`);
 for(const i of plan.viewing.edges){const a=front[i],b=front[i+1];line(metal,a,b,8.99*k,.05*k,.07*k);}
 // Deep window reveals and solid piers are construction, not a wall texture.
 const piers=[1,3,plan.viewing.curvedEnd,plan.viewing.curvedEnd+2];
 for(const i of piers){const a=front[i],b=front[i+1];line(concrete,a,b,floor.elevation+floor.height/2,floor.height,.7*k);addWallCollider(a,b,floor.elevation,floor.height,.7*k);}
 // Panel joints and corner depth follow each compiled opaque wall segment,
 // including lintels. Panels never cover a doorway or a viewing aperture.
 const walls=[];root.traverse(o=>{if(o.isMesh&&o.userData.kind==='wall'&&!o.userData.glazing)walls.push(o);});
 for(const wall of walls){
  const {width,height,depth}=wall.geometry.parameters;if(!width||!height)continue;
  const bottom=wall.position.y-height/2,angle=wall.rotation.y,c=Math.cos(angle),s=Math.sin(angle),cols=Math.max(1,Math.ceil(width/(2.4*k))),rows=Math.max(1,Math.ceil(height/(1.15*k)));
  wall.material=dark;
  for(let side of [-1,1])for(let ix=0;ix<cols;ix++)for(let iy=0;iy<rows;iy++){
   const x=(ix+.5)*width/cols-width/2,z=side*(depth/2+.018*k);
   box(concrete,wall.position.x+c*x+s*z,bottom+(iy+.5)*height/rows,wall.position.z-s*x+c*z,width/cols-.016*k,height/rows-.012*k,.035*k,angle);
  }
  line(dark,{x:wall.position.x-c*width/2,z:wall.position.z+s*width/2},{x:wall.position.x+c*width/2,z:wall.position.z-s*width/2},bottom+.09*k,.18*k,depth+.08*k);
 }
 // Ceiling ribs are clipped to actual room/shaft boundaries. The dark recess
 // between ribs, luminaires and soffits gives the ceiling physical structure.
 for(const f of layout.floors)for(const r of f.rooms){
  const ring=roomRing(f,r),uv=ring.map(p=>({u:(p.x*.66-p.z*.75)/(k*.9981),v:(p.x*.75+p.z*.66)/(k*.9981)})),lo=Math.min(...uv.map(p=>p.u)),hi=Math.max(...uv.map(p=>p.u));
  const inside=(u,v)=>{const p=local(u,v);return pointInRoom(p,ring)&&!compiled.cores.some(c=>f.elevation>=c.bottom&&f.elevation<c.top&&pointInRoom(p,c.outline));};
  let row=0;for(let v=Math.min(...uv.map(p=>p.v))+.65;v<Math.max(...uv.map(p=>p.v))-.2;v+=1.5,row++){
   let start=null;for(let u=lo;u<=hi+.3;u+=.2){const valid=u<hi&&inside(u,v)&&inside(u,v-.08)&&inside(u,v+.08);if(valid&&start===null)start=u;if(!valid&&start!==null){const length=u-start-.2;if(length>.6){part(metal,start+length/2,v,(f.elevation+f.height)/k-.14,length,.25,.095);if(row%3===1&&length>2)part(diffuser,start+length/2,v,(f.elevation+f.height)/k-.275,Math.min(length-1,2.2),.02,.055);}start=null;}}
  }
 }
 // Upper habitat enclosure: exposed supporting ribs and continuous wall seams
 // follow the tank perimeter. Exact upper-floor construction remains unmeasured.
 const roofY=layout.floors.at(-1).elevation+layout.floors.at(-1).height;
 for(let i=0;i<plan.habitat.outline.length;i++){
  if(i>=plan.habitat.viewingEdgeStart&&i<plan.habitat.viewingEdgeStart+plan.habitat.viewingEdgeCount)continue;
  const a=plan.habitat.outline[i],b=plan.habitat.outline[(i+1)%plan.habitat.outline.length],len=Math.hypot(b.x-a.x,b.z-a.z);
  for(let y=9.25*k;y<roofY;y+=1.2*k)line(dark,a,b,y,.018*k,.29*k);
  const n=Math.ceil(len/(4*k));for(let j=0;j<=n;j++){const t=j/n;box(metal,a.x+(b.x-a.x)*t,(roofY+8.25*k)/2,a.z+(b.z-a.z)*t,.13*k,roofY-8.25*k,.3*k,-Math.atan2(b.z-a.z,b.x-a.x));}
 }
 // Boundary/assembly metadata is used by tests; no extra update loop or owner.
 root.userData.aquariumArchitecture={flatWindows:4,curvedWindows:1,windowWidthMeters:27*.3048,windowProjectionMeters:4*.3048,ceiling:'clipped-ribs',scope:'public-reef-route'};
}
