// Bounded topology refinement for the existing far-terrain geometry owner.
// Heights, materials, publication and disposal remain with that owner. Leaves
// share every edge vertex, so a refined valley cannot open a terrain crack.
const coordinate=n=>Math.round(n*1e6)/1e6;
const key=(x,z)=>`${coordinate(x)}:${coordinate(z)}`;
const pointSegmentDistance=(x,z,s)=>{const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-s.a.x-dx*t,z-s.a.z-dz*t);};
export function corridorSegmentDistance(x,z,segment){return pointSegmentDistance(x,z,segment);}
function distanceToBounds(s,b){
 let lower=0,upper=1;
 for(const axis of ['x','z']){
  const delta=s.b[axis]-s.a[axis],min=b[axis==='x'?'minX':'minZ'],max=b[axis==='x'?'maxX':'maxZ'];
  if(!delta){if(s.a[axis]<min||s.a[axis]>max){lower=2;break;}continue;}
  const a=(min-s.a[axis])/delta,c=(max-s.a[axis])/delta;lower=Math.max(lower,Math.min(a,c));upper=Math.min(upper,Math.max(a,c));
 }
 if(lower<=upper)return 0;
 const at=p=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));
 return Math.min(at(s.a),at(s.b),...[[b.minX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.minZ],[b.maxX,b.maxZ]].map(([x,z])=>pointSegmentDistance(x,z,s)));
}
function interval(values,n){let lo=0,hi=values.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(values[mid]<=n)lo=mid;else hi=mid;}return lo;}
const within=(values,a,b)=>{let i=interval(values,a);while(i<values.length&&values[i]<=a+1e-7)i++;const result=[];for(;i<values.length&&values[i]<b-1e-7;i++)result.push(values[i]);return result;};
export async function refineReviewedCorridorCells({xValues,zValues,basePositions,segments,skipCell=()=>false,heightAt,current=()=>true,yieldWork=async()=>{},
 innerSpacing=2,outerSpacing=8,maximumLeaves=220000,maximumVertices=500000}){
 if(!Array.isArray(xValues)||!Array.isArray(zValues)||xValues.length<2||zValues.length<2||!Array.isArray(segments)||segments.length>5000||
  !(innerSpacing>0&&outerSpacing>=innerSpacing)||typeof heightAt!=='function')throw Error('invalid_reviewed_terrain_refinement');
 const roots=new Map(),leaves=[];let checkpoint=performance.now();
 const pause=async()=>{if(!current())throw new DOMException('Reviewed terrain refinement superseded','AbortError');if(performance.now()-checkpoint>=8){await yieldWork();checkpoint=performance.now();}};
 const rootKey=(row,column)=>row*xValues.length+column;
 for(const s of segments){
  if(![s.a?.x,s.a?.z,s.b?.x,s.b?.z,s.innerRadius,s.outerRadius].every(Number.isFinite)||Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z)<=0||!(s.innerRadius>0&&s.outerRadius>s.innerRadius&&s.outerRadius<=100))throw Error('invalid_reviewed_terrain_corridor');
  const minX=Math.max(xValues[0],Math.min(s.a.x,s.b.x)-s.outerRadius),maxX=Math.min(xValues.at(-1),Math.max(s.a.x,s.b.x)+s.outerRadius),
   minZ=Math.max(zValues[0],Math.min(s.a.z,s.b.z)-s.outerRadius),maxZ=Math.min(zValues.at(-1),Math.max(s.a.z,s.b.z)+s.outerRadius);
  if(minX>maxX||minZ>maxZ)continue;
  for(let row=interval(zValues,minZ);row<=Math.min(zValues.length-2,interval(zValues,maxZ));row++)for(let column=interval(xValues,minX);column<=Math.min(xValues.length-2,interval(xValues,maxX));column++){
   const id=rootKey(row,column);if(!roots.has(id))roots.set(id,[]);roots.get(id).push(s);
  }
  await pause();
 }
 async function subdivide(first,candidates){
  const pending=[{cell:first,candidates}];let work=0;
  while(pending.length){
   const {cell,candidates}=pending.pop(),nearby=candidates.filter(s=>distanceToBounds(s,cell)<=s.outerRadius),
    inner=nearby.some(s=>distanceToBounds(s,cell)<=s.innerRadius),spacing=inner?innerSpacing:outerSpacing;
   if(nearby.length&&Math.max(cell.maxX-cell.minX,cell.maxZ-cell.minZ)>spacing+1e-7){
    const x=coordinate((cell.minX+cell.maxX)/2),z=coordinate((cell.minZ+cell.maxZ)/2);
    for(const [minX,maxX]of [[cell.minX,x],[x,cell.maxX]])for(const[minZ,maxZ]of [[cell.minZ,z],[z,cell.maxZ]])pending.push({cell:{...cell,minX,maxX,minZ,maxZ},candidates:nearby});
   }else{leaves.push(cell);if(leaves.length>maximumLeaves)throw Error(`reviewed_terrain_refinement_capacity: leaves ${leaves.length}/${maximumLeaves}`);}
   if(++work%128===0)await pause();
  }
 }

 for(let row=0;row<zValues.length-1;row++){
  for(let column=0;column<xValues.length-1;column++){
   const cell={root:rootKey(row,column),minX:coordinate(Math.fround(xValues[column])),maxX:coordinate(Math.fround(xValues[column+1])),minZ:coordinate(Math.fround(zValues[row])),maxZ:coordinate(Math.fround(zValues[row+1]))};
   if(!skipCell(cell,row,column))await subdivide(cell,roots.get(cell.root)||[]);
  }
  await pause();
 }
 const vertical=new Map(),horizontal=new Map();
 const edgePoint=(x,z)=>{x=coordinate(x);z=coordinate(z);if(!vertical.has(x))vertical.set(x,new Set());vertical.get(x).add(z);if(!horizontal.has(z))horizontal.set(z,new Set());horizontal.get(z).add(x);};
 for(const cell of leaves)for(const x of[cell.minX,cell.maxX])for(const z of[cell.minZ,cell.maxZ])edgePoint(x,z);
 // Existing detailed-tile seam points remain on the conforming perimeter.
 for(let i=0;i<basePositions.length;i+=3)edgePoint(basePositions[i],basePositions[i+2]);
 for(const map of[vertical,horizontal])for(const[k,values]of map)map.set(k,[...values].sort((a,b)=>a-b));
 const positions=Array.from(basePositions),byPoint=new Map(),updated=new Set(),trianglesByCell=new Map(),indices=[];
 for(let i=0;i<positions.length;i+=3)if(!byPoint.has(key(positions[i],positions[i+2])))byPoint.set(key(positions[i],positions[i+2]),i/3);
 function vertex(x,z,root){
  x=coordinate(x);z=coordinate(z);const id=key(x,z);let index=byPoint.get(id);
  if(index===undefined){index=positions.length/3;if(index>=maximumVertices)throw Error(`reviewed_terrain_refinement_capacity: vertices ${index}/${maximumVertices}`);byPoint.set(id,index);positions.push(x,0,z);}
  if(!updated.has(index)){
   const y=heightAt(x,z,roots.get(root)||[]);if(!Number.isFinite(y))throw Error('reviewed_terrain_ground_unavailable');positions[index*3+1]=Math.fround(y);updated.add(index);
  }
  return index;
 }
 for(const c of leaves){
  const ring=[[c.minX,c.minZ],...within(vertical.get(c.minX),c.minZ,c.maxZ).map(z=>[c.minX,z]),[c.minX,c.maxZ],
   ...within(horizontal.get(c.maxZ),c.minX,c.maxX).map(x=>[x,c.maxZ]),[c.maxX,c.maxZ],
   ...within(vertical.get(c.maxX),c.minZ,c.maxZ).reverse().map(z=>[c.maxX,z]),[c.maxX,c.minZ],
   ...within(horizontal.get(c.minZ),c.minX,c.maxX).reverse().map(x=>[x,c.minZ])],perimeter=ring.map(([x,z])=>vertex(x,z,c.root));
  const triangles=[];if(roots.has(c.root)||perimeter.length!==4){if(!trianglesByCell.has(c.root))trianglesByCell.set(c.root,[]);}
  // Preserve the exact old two-triangle split in untouched regular cells.
  if(perimeter.length===4&&!roots.has(c.root)){
   for(const triangle of[[perimeter[0],perimeter[1],perimeter[3]],[perimeter[3],perimeter[1],perimeter[2]]]){indices.push(...triangle);triangles.push(triangle);}
  }else{
   const center=vertex((c.minX+c.maxX)/2,(c.minZ+c.maxZ)/2,c.root);
   perimeter.forEach((index,i)=>{const triangle=[center,index,perimeter[(i+1)%perimeter.length]];indices.push(...triangle);triangles.push(triangle);});
  }
  if(trianglesByCell.has(c.root))trianglesByCell.get(c.root).push(...triangles);
  await pause();
 }
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),trianglesByCell,stats:{leaves:leaves.length,vertices:positions.length/3,triangles:indices.length/3,sourceSegments:segments.length,sourceCells:roots.size,innerSpacingWorld:innerSpacing,outerSpacingWorld:outerSpacing}};
}
