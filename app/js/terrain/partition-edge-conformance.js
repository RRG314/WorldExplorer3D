// Construction-only topology repair. Partition cuts can add a vertex on an
// existing triangle edge. Both neighbours must reference it, including its
// already compiled height, before the terrain is used as pavement support.
const cross=(p,a,b,c)=>(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])-(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);
function splitEdges(p,triangle,cuts){
 const sign=Math.sign(cross(p,...triangle)),pieces=[triangle];
 for(let edge=0;edge<3;edge++){
  let previous=triangle[edge];const end=triangle[(edge+1)%3];
  for(const id of cuts[edge]){
   const index=pieces.findIndex(t=>t.includes(previous)&&t.includes(end));
   if(index<0)throw Object.assign(Error('reviewed_terrain_partition_edge_invalid'),{partitionRing:triangle.map(i=>[p[i*3],p[i*3+2]])});
   const other=pieces[index].find(v=>v!==previous&&v!==end),next=[[previous,id,other],[id,end,other]];
   pieces.splice(index,1,...next);previous=id;
  }
 }
 // Insert each boundary point into its incident face, even if independent
 // Float32 rounding bends the logical edge slightly. Polygon ear clipping
 // could bypass it by keeping the old face beside a microscopic sliver.
 return pieces.filter(t=>cross(p,...t)!==0).map(t=>cross(p,...t)*sign<0?[t[0],t[2],t[1]]:t);
}
export async function conformPartitionEdges(positions,triangles,{cellSize=8,maximumTriangles=2000000,maximumHeightMergeErrorWorld=.003,pause=async()=>{}}={}){
 const columns=new Map(),replacements=new Map(),used=new Uint8Array(positions.length/3),aliases=new Uint32Array(used.length);
 let conformedTriangles=0,insertedEdgeVertices=0,mergedVertices=0,collapsedTriangles=0,count=triangles.length;
 for(const triangle of triangles)for(const id of triangle)used[id]=1;
 for(let i=0;i<positions.length;i+=3){
  const index=i/3;aliases[index]=index;if(!used[index])continue;
  const px=positions[i],pz=positions[i+2],x=Math.floor(px/cellSize),z=Math.floor(pz/cellSize),tolerance=Math.max(.000002,Math.abs(px)*2**-23,Math.abs(pz)*2**-23);
  let closest=null;
  for(let bx=x-1;bx<=x+1;bx++)for(let bz=z-1;bz<=z+1;bz++)for(const id of columns.get(bx)?.get(bz)||[]){
   const distance=Math.hypot(px-positions[id*3],pz-positions[id*3+2]);if(distance>tolerance||closest&&distance>=closest.distance)continue;
   // Only numerical duplicates of the same continuous compiled terrain may
   // share an existing vertex. A real conflicting surface remains a failure.
   const y=positions[i+1],other=positions[id*3+1],heightTolerance=maximumHeightMergeErrorWorld;
   if(Math.abs(y-other)>heightTolerance)throw Object.assign(Error('reviewed_terrain_partition_vertex_mismatch'),{partitionVertices:{a:positions.slice(i,i+3),b:positions.slice(id*3,id*3+3),distance,heightTolerance}});
   closest={id,distance};
  }
  if(closest){aliases[index]=closest.id;mergedVertices++;}
  else{let column=columns.get(x);if(!column)columns.set(x,column=new Map());let bucket=column.get(z);if(!bucket)column.set(z,bucket=[]);bucket.push(index);}
  if(i%3072===0)await pause();
 }
 const edges=new Map();
 const edgePoints=(a,b)=>{
  const key=a<b?`${a}:${b}`:`${b}:${a}`;
  if(edges.has(key)){const ids=edges.get(key);return a<b?ids:[...ids].reverse();}
  const first=Math.min(a,b),last=Math.max(a,b),ax=positions[first*3],az=positions[first*3+2],bx=positions[last*3],bz=positions[last*3+2],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),
   // One Float32 coordinate unit bounds the independent rounding of cuts.
   tolerance=Math.max(.000002,Math.abs(ax)*2**-23,Math.abs(az)*2**-23,Math.abs(bx)*2**-23,Math.abs(bz)*2**-23),found=[];
  for(let x=Math.floor((Math.min(ax,bx)-tolerance)/cellSize);x<=Math.floor((Math.max(ax,bx)+tolerance)/cellSize);x++)for(let z=Math.floor((Math.min(az,bz)-tolerance)/cellSize);z<=Math.floor((Math.max(az,bz)+tolerance)/cellSize);z++)for(const id of columns.get(x)?.get(z)||[]){
   if(id===a||id===b)continue;const wx=positions[id*3]-ax,wz=positions[id*3+2]-az,t=(wx*dx+wz*dz)/(length*length);
   if(t*length<=tolerance||(1-t)*length<=tolerance||Math.abs(wx*dz-wz*dx)>tolerance*length)continue;
   found.push({id,t});if(found.length>128)throw Error('reviewed_terrain_partition_edge_capacity');
  }
  const ids=found.sort((a,b)=>a.t-b.t||a.id-b.id).map(p=>p.id);edges.set(key,ids);return a<b?ids:[...ids].reverse();
 };
 for(let i=0;i<triangles.length;i++){
  const source=triangles[i],triangle=source.map(id=>aliases[id]),selected=new Map();
  if(new Set(triangle).size<3||cross(positions,...triangle)===0){replacements.set(source,[]);collapsedTriangles++;count--;continue;}
  // A thin Float32 sliver can put its own third corner within one coordinate
  // unit of another edge. Corners are already in the ring. Other near-corner
  // cuts belong to their closest edge, so the ring cannot repeat a vertex.
  for(let j=0;j<3;j++)for(const id of edgePoints(triangle[j],triangle[(j+1)%3])){
   if(triangle.includes(id))continue;
   const a=triangle[j],b=triangle[(j+1)%3],distance=Math.abs(cross(positions,a,b,id))/Math.hypot(positions[b*3]-positions[a*3],positions[b*3+2]-positions[a*3+2]);
   if(!selected.has(id)||selected.get(id).distance>distance)selected.set(id,{edge:j,distance});
  }
  const cuts=triangle.map((a,j)=>edgePoints(a,triangle[(j+1)%3]).filter(id=>selected.get(id)?.edge===j));
  const inserted=cuts.reduce((sum,ids)=>sum+ids.length,0);
  if(inserted){
   const next=splitEdges(positions,triangle,cuts);count+=next.length-1;if(count>maximumTriangles)throw Error('reviewed_terrain_boundary_triangle_capacity');
   replacements.set(source,next);conformedTriangles++;insertedEdgeVertices+=inserted;
  }else if(triangle.some((id,j)=>id!==source[j]))replacements.set(source,[triangle]);
  if(i%128===0)await pause();
 }
 return {replacements,conformedTriangles,insertedEdgeVertices,mergedVertices,collapsedTriangles};
}
