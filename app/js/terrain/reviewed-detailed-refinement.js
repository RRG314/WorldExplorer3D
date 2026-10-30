import {refineReviewedCorridorCells,corridorSegmentDistance} from './reviewed-corridor-refinement.js';
import {reviewedTerrainCorridors,REVIEWED_DETAIL_MAXIMUM_SPACING_METERS,REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES,REVIEWED_CORRIDOR_OUTER_SPACING_METERS} from './reviewed-corridor-policy.js';
import {terrainGridInterval} from './world-grid.js';
import {markGroundSurfaceChanged} from './surface-revision.js';

const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
function weightsAt(p,n,x,z){
 const stride=n+1,col=terrainGridInterval(p,n,3,0,x),row=terrainGridInterval(p,n,stride*3,2,z),a=row*stride+col,b=a+1,c=a+stride,d=c+1,
  u=(x-p[a*3])/(p[b*3]-p[a*3]),v=(z-p[a*3+2])/(p[c*3+2]-p[a*3+2]);
 return u+v<=1?[[a,1-u-v],[b,u],[c,v]]:[[d,u+v-1],[c,1-u],[b,1-v]];
}

// Staged geometry for the existing detailed mesh. Its original regular-grid
// vertices retain their indices; only affected cells acquire extra triangles.
// Sampling refers to these same indices, never to a second height field.
export async function prepareReviewedDetailedTerrainMesh(mesh,{segments,scale=1,sampleGround,gradeGround=(x,z,y)=>y,waterGround=(x,z,y)=>y,current=()=>true,yieldWork=async()=>{},maximumAddedVertices=REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES}={}){
 const geometry=mesh.geometry,n=geometry.parameters?.widthSegments,source=geometry.attributes.position;
 if(!Number.isInteger(n)||n<1||!source||typeof sampleGround!=='function'||!Number.isSafeInteger(maximumAddedVertices)||maximumAddedVertices<0||maximumAddedVertices>REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES)throw Error('invalid_reviewed_detailed_terrain');
 const count=(n+1)**2;if(source.count<count)throw Error('invalid_reviewed_detailed_terrain');
 const base=new Float32Array(count*3),origin=mesh.position||{};
 for(let i=0;i<count;i++){base[i*3]=source.array[i*3]+(origin.x||0);base[i*3+1]=source.array[i*3+1]+(origin.y||0);base[i*3+2]=source.array[i*3+2]+(origin.z||0);}
 const xValues=Array.from({length:n+1},(_,i)=>base[i*3]),zValues=Array.from({length:n+1},(_,i)=>base[i*(n+1)*3+2]),
  nearby=segments.filter(s=>Math.max(s.a.x,s.b.x)+s.outerRadius>=xValues[0]&&Math.min(s.a.x,s.b.x)-s.outerRadius<=xValues.at(-1)&&Math.max(s.a.z,s.b.z)+s.outerRadius>=zValues[0]&&Math.min(s.a.z,s.b.z)-s.outerRadius<=zValues.at(-1));
 if(!nearby.length)return null;
 // Adjacent tiles subdivide their interiors independently. Seed the same
 // fine perimeter stations wherever corridor work can reach a tile edge.
 const edgeStations=[],spacing=REVIEWED_DETAIL_MAXIMUM_SPACING_METERS*scale,diagonal=Math.hypot(xValues[1]-xValues[0],zValues[1]-zValues[0]);let checkpoint=performance.now();
 for(const[values,fixed,axis]of[[xValues,zValues[0],'x'],[xValues,zValues.at(-1),'x'],[zValues,xValues[0],'z'],[zValues,xValues.at(-1),'z']])for(let i=1;i<values.length;i++){
  const cuts=2**Math.max(0,Math.ceil(Math.log2((values[i]-values[i-1])/spacing)));
  for(let j=1;j<cuts;j++){
   const value=values[i-1]+(values[i]-values[i-1])*j/cuts,x=axis==='x'?value:fixed,z=axis==='z'?value:fixed;
   if(segments.some(s=>corridorSegmentDistance(x,z,s)<=s.outerRadius+diagonal))edgeStations.push({x,z});
  }
  if(performance.now()-checkpoint>=8){if(!current())throw new DOMException('Reviewed detailed terrain superseded','AbortError');await yieldWork();checkpoint=performance.now();}
 }
 const refined=await refineReviewedCorridorCells({xValues,zValues,basePositions:base,segments:nearby,current,yieldWork,innerSpacing:spacing,outerSpacing:REVIEWED_CORRIDOR_OUTER_SPACING_METERS*scale,
  edgeStations,maximumVertices:count+maximumAddedVertices,heightAt:(x,z,candidates)=>{
   const weights=weightsAt(base,n,x,z),old=weights.reduce((y,[i,w])=>y+base[i*3+1]*w,0);let weight=0;
   for(const s of candidates)weight=Math.max(weight,1-smooth((corridorSegmentDistance(x,z,s)-s.innerRadius)/(s.outerRadius-s.innerRadius)));
   if(!weight)return old;
   const ground=sampleGround(x,z);if(!Number.isFinite(ground))throw Error('reviewed_terrain_source_ground_unavailable');
   const y=waterGround(x,z,gradeGround(x,z,ground));return old+(y-old)*weight;
  }});
 const attributes=new Map();let started=performance.now();
 for(const[name,attribute]of Object.entries(geometry.attributes)){
  if(name==='position'||name==='normal')continue;
  if(attribute.count!==source.count)throw Error('reviewed_terrain_attribute_shape');
  const array=new attribute.array.constructor(refined.positions.length/3*attribute.itemSize);array.set(attribute.array.subarray(0,count*attribute.itemSize));
  for(let i=count;i<refined.positions.length/3;i++){
   const weights=weightsAt(base,n,refined.positions[i*3],refined.positions[i*3+2]);
   for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=weights.reduce((v,[id,w])=>v+attribute.array[id*attribute.itemSize+j]*w,0);
   if(performance.now()-started>=8){if(!current())throw new DOMException('Reviewed detailed terrain superseded','AbortError');await yieldWork();started=performance.now();}
  }
  attributes.set(name,{array,itemSize:attribute.itemSize,normalized:attribute.normalized});
 }
 const cells=new Map();for(const[id,triangles]of refined.trianglesByCell)cells.set(id,Uint32Array.from(triangles.flat()));
 if(!current())throw new DOMException('Reviewed detailed terrain superseded','AbortError');
 return {...refined,attributes,cells,addedVertices:refined.positions.length/3-count};
}

export async function refineReviewedDetailedTerrain(context,deps,{current=()=>true,yieldWork=async()=>{}}={}){
 const corridor=reviewedTerrainCorridors(context);if(!corridor)return null;
 const {runtime,venue,scale,segments}=corridor,stamp=`${runtime.sequence}:${venue.id}:${venue.sourceSha256}`,active=()=>current()&&context.worldLoadRuntimeState===runtime;
 let remaining=REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES,meshes=0,addedVertices=0;
 for(const mesh of context.terrainGroup?.children||[]){
  if(!mesh.userData?.isTerrainMesh||mesh.visible===false||mesh.userData.pendingTerrainTile)continue;
  if(mesh.userData.reviewedCorridorRefinement?.stamp===stamp){remaining-=mesh.userData.reviewedCorridorRefinement.addedVertices;continue;}
  const staged=await prepareReviewedDetailedTerrainMesh(mesh,{segments,scale,current:active,yieldWork,maximumAddedVertices:remaining,
   sampleGround:(x,z)=>{const {lat,lon}=context.worldToGeo(x,z),meters=deps.sampleAcceptedGroundElevationAtLatLon(lat,lon);const height=Number.isFinite(meters)&&typeof deps.clampElevationMeters==='function'?deps.clampElevationMeters(meters):meters;return Number.isFinite(height)?height*scale*(Number(context.TERRAIN_Y_EXAGGERATION)||1):NaN;},
   gradeGround:deps.applyStructureTerrainCuts,waterGround:deps.resolveWaterTerrainY});
  if(!staged)continue;
  if(!active())throw new DOMException('Reviewed detailed terrain superseded','AbortError');
  const old=mesh.geometry,next=new THREE.BufferGeometry();next.parameters={...old.parameters};
  next.setAttribute('position',new THREE.BufferAttribute(staged.positions,3));
  for(const[name,a]of staged.attributes)next.setAttribute(name,new THREE.BufferAttribute(a.array,a.itemSize,a.normalized));
  next.setIndex(new THREE.BufferAttribute(staged.indices,1));next.computeVertexNormals();next.computeBoundingSphere();
  mesh.geometry=next;mesh.position.set(0,0,0);mesh.userData.reviewedTerrainCells=staged.cells;
  mesh.userData.reviewedCorridorRefinement=Object.freeze({...staged.stats,stamp,addedVertices:staged.addedVertices,venueId:venue.id,sourceSha256:venue.sourceSha256});
  delete mesh.userData.baseTerrainWorldY;old.dispose();markGroundSurfaceChanged(context);
  remaining-=staged.addedVertices;addedVertices+=staged.addedVertices;meshes++;await yieldWork();
 }
 return {meshes,addedVertices,maximumAddedVertices:REVIEWED_DETAIL_MAXIMUM_ADDED_VERTICES};
}
