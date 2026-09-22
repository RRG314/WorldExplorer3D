import test from 'node:test';
import assert from 'node:assert/strict';
import {appendRoadCenterMarkings} from '../app/js/terrain/rebuild.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const area=vertices=>{let total=0;for(let i=0;i<vertices.length;i+=9)total+=Math.abs((vertices[i+3]-vertices[i])*(vertices[i+8]-vertices[i+2])-(vertices[i+5]-vertices[i+2])*(vertices[i+6]-vertices[i]))/2;return total;};
function heightAt(vertices,x,z){
 for(let i=0;i<vertices.length;i+=9){
  const ax=vertices[i],az=vertices[i+2],bx=vertices[i+3],bz=vertices[i+5],cx=vertices[i+6],cz=vertices[i+8];
  const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)return u*vertices[i+1]+v*vertices[i+4]+(1-u-v)*vertices[i+7];
 }return null;
}
test('whole dashes retain coverage, winding and support height across a fold and an unsupported gap',()=>{
 const positions=[],indices=[],height=x=>.05*x+Math.max(0,x-14)*.15;
 for(const [a,b]of [[0,8],[12,14],[14,30]]){
  const base=positions.length/3;positions.push(a,height(a),-6,a,height(a),6,b,height(b),-6,b,height(b),6);indices.push(base,base+1,base+2,base+2,base+1,base+3);
 }
 const index=createRoadContactIndex([{geometry:{attributes:{position:{array:new Float32Array(positions)}},getIndex:()=>({array:indices})},userData:{terrainMode:'at_grade'}}]);
 try{
  const road={type:'primary',width:12},points=[{x:-2,z:0},{x:32,z:0}],old=[],next=[];
  const legacy={projectTriangle:index.projectTriangle};
  appendRoadCenterMarkings(road,points,old,[],null,(x,z)=>index.sampleAt(x,z),legacy);
  appendRoadCenterMarkings(road,points,next,[],null,(x,z)=>index.sampleAt(x,z),index);
  assert.ok(next.length<old.length,'remove only redundant internal triangulation');
  assert.ok(Math.abs(area(next)-4.2)<1e-7);assert.ok(Math.abs(area(old)-area(next))<1e-7);
  for(let x=-2;x<=32;x+=.137)for(const z of [-.151,-.149,0,.149,.151]){
   const a=heightAt(old,x,z),b=heightAt(next,x,z);assert.equal(a===null,b===null,`coverage at ${x},${z}`);
   if(a!==null)assert.ok(Math.abs(a-b)<1e-7);
  }
  for(let i=0;i<next.length;i+=9){
   const x=(next[i]+next[i+3]+next[i+6])/3,z=(next[i+2]+next[i+5]+next[i+8])/3,y=(next[i+1]+next[i+4]+next[i+7])/3;
   assert.ok(Math.abs(y-index.sampleAt(x,z)-.012)<1e-7);
   assert.ok((next[i+3]-next[i])*(next[i+8]-next[i+2])-(next[i+5]-next[i+2])*(next[i+6]-next[i])<0,'all triangles face upward');
  }
  assert.equal(index.projectPolygon([{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}],.012,'elevated').length,0);
 }finally{index.dispose();}
});
