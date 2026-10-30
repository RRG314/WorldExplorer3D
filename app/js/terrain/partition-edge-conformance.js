// Construction-only topology repair. Partition cuts can add a vertex on an
// existing triangle edge. Both neighbours must reference it, including its
// already compiled height, before the terrain is used as pavement support.
const cross=(p,a,b,c)=>(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])-(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);
function triangulate(p,ring,sign){
 const result=[],remaining=[...ring];
 while(remaining.length>3){
  let ear=-1;
  for(let i=0;i<remaining.length;i++){
   const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
   if(cross(p,a,b,c)*sign<=1e-12)continue;
   if(remaining.some(v=>v!==a&&v!==b&&v!==c&&cross(p,a,b,v)*sign>=-1e-12&&cross(p,b,c,v)*sign>=-1e-12&&cross(p,c,a,v)*sign>=-1e-12))continue;
   result.push([a,b,c]);ear=i;break;
  }
  if(ear<0)throw Object.assign(Error('reviewed_terrain_partition_edge_invalid'),{partitionRing:ring.map(i=>[p[i*3],p[i*3+2]])});remaining.splice(ear,1);
 }
 if(Math.abs(cross(p,...remaining))>1e-12)result.push(remaining);return result;
}
export async function conformPartitionEdges(positions,triangles,{cellSize=8,maximumTriangles=2000000,pause=async()=>{}}={}){
 const columns=new Map(),replacements=new Map();let conformedTriangles=0,insertedEdgeVertices=0,count=triangles.length;
 for(let i=0;i<positions.length;i+=3){
  const x=Math.floor(positions[i]/cellSize),z=Math.floor(positions[i+2]/cellSize);let column=columns.get(x);if(!column)columns.set(x,column=new Map());let bucket=column.get(z);if(!bucket)column.set(z,bucket=[]);bucket.push(i/3);
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
  const triangle=triangles[i],ring=[],selected=new Map();
  // A thin Float32 sliver can put its own third corner within one coordinate
  // unit of another edge. Corners are already in the ring. Other near-corner
  // cuts belong to their closest edge, so the ring cannot repeat a vertex.
  for(let j=0;j<3;j++)for(const id of edgePoints(triangle[j],triangle[(j+1)%3])){
   if(triangle.includes(id))continue;
   const a=triangle[j],b=triangle[(j+1)%3],distance=Math.abs(cross(positions,a,b,id))/Math.hypot(positions[b*3]-positions[a*3],positions[b*3+2]-positions[a*3+2]);
   if(!selected.has(id)||selected.get(id).distance>distance)selected.set(id,{edge:j,distance});
  }
  for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3];ring.push(a,...edgePoints(a,b).filter(id=>selected.get(id)?.edge===j));}
  if(ring.length>3){
   const next=triangulate(positions,ring,Math.sign(cross(positions,...triangle)));count+=next.length-1;if(count>maximumTriangles)throw Error('reviewed_terrain_boundary_triangle_capacity');
   replacements.set(triangle,next);conformedTriangles++;insertedEdgeVertices+=ring.length-3;
  }
  if(i%128===0)await pause();
 }
 return {replacements,conformedTriangles,insertedEdgeVertices};
}
