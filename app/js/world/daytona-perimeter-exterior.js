import {roadPavementSectionForSegment} from './road-pavement-sections.js';
import {roadPavementFrameAtSegment} from './road-pavement-coordinate-frame.js';
import {venueComponentCollider} from './venue-collision.js';
import {createChainLinkTexture} from './chain-link-texture.js';
import {finishVenueSurface} from './venue-surface-materials.js';
import {createRoadMarkingMaterial} from '../road-render.js?v=4';
import {appendDaytonaPitMarkings} from './daytona-pit-markings.js';

const quadOrder=[0,1,2,0,2,3];
function quad(values,points){for(const i of quadOrder)values.push(points[i].x,points[i].y,points[i].z);}
// Original exterior interpretation of the retained oval's outer wall, catch
// fence and painted boundaries. Dimensions are estimates, not a safety survey.
// Reads final published road triangles once; no surface, height or frame owner.
export function buildDaytonaPerimeter(ctx){
 const venue=ctx.worldLoadRuntimeState?.venuePack,unit=ctx.METERS_PER_WORLD_UNIT||1,index=ctx.roadContactIndex;
 if(venue?.id!=='daytona-tri-oval'||venue.sourceFeatureIds?.length!==5||!Array.isArray(ctx.roads)||!index?.projectPolygon||!index?.sampleAt)return null;
 const roads=venue.sourceFeatureIds.map(id=>ctx.roads.find(r=>r.sourceFeatureId===id));
 if(roads.length!==5||roads.some(r=>!r?.transportRecord?.crossSection?.pavementSections||r.transportSurfaceModel?.reviewedSurfacePhase!=='accepted'))return null;
 const pitRoads=(venue.pitSourceFeatureIds||[]).map(id=>ctx.roads.find(r=>r.sourceFeatureId===id));
 if(pitRoads.some(r=>!r?.transportRecord?.crossSection?.pavementSections||r.transportSurfaceModel?.reviewedSurfacePhase!=='accepted'))return null;
 const chunks=new Map(),colliders=[];let distance=0,paintFaces=0;
 const baseContact=(x,z)=>{
  const y=index.sampleAt(x,z,NaN,'at_grade');if(Number.isFinite(y))return y;
  // A wall footing may meet a clipped source corner just beside the transect.
  // Read its actual nearest triangle, bounded to four centimetres. This does
  // not alter the index, road footprint or any driving/qualification tolerance.
  return index.nearestSurfaceAt?.(x,z,.04/unit,'at_grade')?.y;
 };
 const chunkAt=d=>{const key=Math.floor(d/128);if(!chunks.has(key))chunks.set(key,{key,wall:[],fence:[],fenceUvs:[],metal:[],paint:[],colors:[],center:null});return chunks.get(key);};
 for(const road of roads){
  const profile=road.transportRecord.crossSection.pavementSections;
  for(let segment=0;segment<road.pts.length-1;segment++){
   const a=road.pts[segment],b=road.pts[segment+1],length=Math.hypot(b.x-a.x,b.z-a.z)*unit,count=Math.max(1,Math.ceil(length/2));
   const station=t=>{
    const n=roadPavementFrameAtSegment(profile,segment,t),section=roadPavementSectionForSegment(road,segment,t),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,
     point=(lateral,height=0)=>({x:x+n.x*lateral,y:height,z:z+n.z*lateral}),near=point(section.positive-.2/unit),inner=point(section.positive-.4/unit),
     nearY=baseContact(near.x,near.z),innerY=baseContact(inner.x,inner.z);
    // Source joins can trim centimetres from the very outside corner. Read two
    // actual interior contacts and continue their short crossfall to the wall
    // base; never enlarge contacts or invent support under the drivable road.
    if(!Number.isFinite(nearY)||!Number.isFinite(innerY))throw Error('daytona_perimeter_surface_unavailable');
    const y=2*nearY-innerY;
    return {section,point,y};
   };
   for(let i=0;i<count;i++){
    const s=station(i/count),e=station((i+1)/count),d0=distance+i*length/count,d1=distance+(i+1)*length/count,c=chunkAt((d0+d1)/2);
    c.center??={...s.point(s.section.positive),y:s.y};
    // Recess the wall base below the edge; its inner face starts outside all
    // admitted asphalt. No inner barrier blocks the apron or mapped pit access.
    const ring=s=>[[.04,-.18],[.04,1.12],[.34,1.12],[.34,-.18]].map(([l,h])=>s.point(s.section.positive+l/unit,s.y+h/unit)),p=ring(s),q=ring(e);
    for(let j=0;j<4;j++)quad(c.wall,[p[j],q[j],q[(j+1)%4],p[(j+1)%4]]);
    const fence=s=>[[.25,1.12],[.25,4.8],[-.35,6.0],[-.85,6.4]].map(([l,h])=>s.point(s.section.positive+l/unit,s.y+h/unit)),f=fence(s),g=fence(e);
    for(let j=0;j<3;j++){
     quad(c.fence,[f[j],g[j],g[j+1],f[j+1]]);
     const low=[0,3.68,5.02][j],high=[3.68,5.02,5.66][j];
     for(const k of quadOrder)c.fenceUvs.push([d0/.12,d1/.12,d1/.12,d0/.12][k],[low,low,high,high][k]/.12);
    }
    // Paint is clipped by the existing decal projector to the actual uploaded
    // triangles. It follows the bank/apron crease without bridging its folds.
    for(const [offset,color] of [[s=>s.positive-.26/unit,[.88,.88,.82]],[s=>-s.bankNegative+.16/unit,[.95,.64,.035]],[s=>-s.bankNegative+.48/unit,[.95,.64,.035]]]){
     const half=.055/unit,polygon=[s.point(offset(s.section)-half),e.point(offset(e.section)-half),e.point(offset(e.section)+half),s.point(offset(s.section)+half)],
      paint=index.projectPolygon(polygon,.008/unit,'at_grade');
     if(!paint.length)throw Error('daytona_perimeter_paint_unsupported');
     for(const value of paint)c.paint.push(value);for(let k=0;k<paint.length/3;k++)c.colors.push(...color);paintFaces+=paint.length/9;
    }
   }
   // Indexed collision volumes use the existing building/structure owner.
   // Eight-metre spans bound their count without spanning a source corner.
   const collisionCount=Math.max(1,Math.ceil(length/8));
   for(let i=0;i<collisionCount;i++){
    const s=station(i/collisionCount),e=station((i+1)/collisionCount),pts=[s.point(s.section.positive+.04/unit),e.point(e.section.positive+.04/unit),e.point(e.section.positive+.34/unit),s.point(s.section.positive+.34/unit)],
     collider=venueComponentCollider(`${road.sourceFeatureId}:outer-wall:${segment}:${i}`,pts,Math.min(s.y,e.y)-.18/unit,Math.max(s.y,e.y)+1.12/unit);
    collider.collisionKind='barrier';colliders.push(collider);
   }
   // Steel supports are geometry rather than thousands of independent meshes.
   const supports=Math.max(1,Math.ceil(length/8));
   for(let i=0;i<supports;i++){
    const t=i/supports,s=station(t),c=chunkAt(distance+t*length),n=roadPavementFrameAtSegment(profile,segment,t),mag=Math.hypot(n.x,n.z),tx=n.z/mag,tz=-n.x/mag,
     nodes=[[.25,1.12],[.25,4.8],[-.35,6],[-.85,6.4]].map(([l,h])=>s.point(s.section.positive+l/unit,s.y+h/unit));
    c.center??={...s.point(s.section.positive),y:s.y};
    const joint=[s.point(s.section.positive+.035/unit,s.y),s.point(s.section.positive+.035/unit,s.y+1.12/unit)].flatMap(p=>[-1,1].map(sign=>({x:p.x+tx*sign*.008/unit,y:p.y,z:p.z+tz*sign*.008/unit})));
    quad(c.metal,[joint[0],joint[1],joint[3],joint[2]]);
    for(let j=1;j<nodes.length;j++){
     const p=nodes[j-1],q=nodes[j],half=.045/unit;
     quad(c.metal,[{x:p.x-tx*half,y:p.y,z:p.z-tz*half},{x:q.x-tx*half,y:q.y,z:q.z-tz*half},{x:q.x+tx*half,y:q.y,z:q.z+tz*half},{x:p.x+tx*half,y:p.y,z:p.z+tz*half}]);
     quad(c.metal,[{x:p.x-n.x/mag*half,y:p.y,z:p.z-n.z/mag*half},{x:q.x-n.x/mag*half,y:q.y,z:q.z-n.z/mag*half},{x:q.x+n.x/mag*half,y:q.y,z:q.z+n.z/mag*half},{x:p.x+n.x/mag*half,y:p.y,z:p.z+n.z/mag*half}]);
    }
   }
   distance+=length;
  }
 }
 const pit=pitRoads.length?appendDaytonaPitMarkings(pitRoads,index,unit,chunkAt,Math.ceil(distance/128)*128):null;
 return {chunks:[...chunks.values()],colliders,lengthMeters:distance,paintFaces:paintFaces+(pit?.paintFaces||0),...(pit?{pit}:{} )};
}

export function createDaytonaPerimeterExterior(T,ctx){
 if(ctx.buildingMeshes?.some(m=>m.userData?.daytonaPerimeter))return null;
 const plan=buildDaytonaPerimeter(ctx);if(!plan)return null;
 const root=new T.Group(),unit=ctx.METERS_PER_WORLD_UNIT||1;
 root.name='Daytona — permanent outer wall, catch fence and boundary paint';
 root.userData={daytonaPerimeter:true,reviewedVenueExterior:true,exteriorOnly:true,
  sourceClaim:'Retained mapped centreline and reviewed pavement sections; original estimated outer wall, catch fence and paint; no official safety specification',
  presentation:{lengthMeters:plan.lengthMeters,chunks:plan.chunks.length,paintFaces:plan.paintFaces,wallHeightMeters:1.12,fenceTopMeters:6.4,colliders:plan.colliders.length,...(plan.pit?{pit:plan.pit}:{})}};
 const wall=new T.MeshStandardMaterial({color:0xd8dad2,roughness:.95,side:T.DoubleSide}),
  metal=new T.MeshStandardMaterial({color:0x747e81,metalness:.65,roughness:.6,side:T.DoubleSide}),
  fence=new T.MeshStandardMaterial({color:0x899396,map:createChainLinkTexture(T),transparent:true,opacity:.66,depthWrite:false,side:T.DoubleSide,metalness:.35,roughness:.75}),
  paint=createRoadMarkingMaterial({color:0xffffff,emissive:0,emissiveIntensity:0,vertexColors:true,roughness:.88,side:T.DoubleSide,depthWrite:false},T),
  filteredPaint=plan.pit?createRoadMarkingMaterial({color:0xffffff,emissive:0,emissiveIntensity:0,vertexColors:true,roughness:.88,side:T.DoubleSide,filteredStroke:true},T):null;
 function mesh(values,material,center,uvs,colors,coverage){
  const g=new T.BufferGeometry(),p=new Float32Array(values.length);
  for(let i=0;i<values.length;i+=3){p[i]=values[i]-center.x;p[i+1]=values[i+1]-center.y;p[i+2]=values[i+2]-center.z;}
  g.setAttribute('position',new T.BufferAttribute(p,3));if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));if(coverage)g.setAttribute('markingStroke',new T.Float32BufferAttribute(coverage,4));g.computeVertexNormals();g.computeBoundingSphere();
  const m=new T.Mesh(g,material);m.receiveShadow=true;if(material===paint||material===filteredPaint)m.renderOrder=4;return m;
 }
 for(const c of plan.chunks){
  const group=new T.Group();group.position.set(c.center.x,c.center.y,c.center.z);root.add(group);
  const lod=new T.LOD(),near=new T.Group(),far=new T.Group();group.add(lod);
  const wallMesh=c.wall.length?mesh(c.wall,wall,c.center):null,paintMesh=mesh(c.paint,c.strokeCoverage?filteredPaint:paint,c.center,null,c.colors,c.strokeCoverage);
  if(wallMesh)near.add(wallMesh);if(c.fence.length)near.add(mesh(c.fence,fence,c.center,c.fenceUvs));if(c.metal.length)near.add(mesh(c.metal,metal,c.center));near.add(paintMesh);
  // Shared geometry is owned by this root and disposed by the world lifecycle.
  const distantPaint=new T.Mesh(paintMesh.geometry,paintMesh.material);distantPaint.renderOrder=4;if(wallMesh)far.add(new T.Mesh(wallMesh.geometry,wall));far.add(distantPaint);
  lod.addLevel(near,0);lod.addLevel(far,650/unit);lod.addLevel(new T.Group(),1900/unit);
 }
 finishVenueSurface(T,root,wall,'../../assets/textures/earth/concrete_diffuse.jpg',2/unit);
 // Keep the painted white finish. The existing concrete image supplies only
 // subtle surface relief; multiplying its brown colour made the wall unpainted.
 if(wall.map){wall.bumpMap=wall.map;wall.bumpScale=.012/unit;wall.map=null;wall.needsUpdate=true;}
 return {root,colliders:plan.colliders};
}
