import {createPavementTerrainPartition} from '../app/js/world/pavement-terrain-partition.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {conformPavementMesh} from '../app/js/world/pavement-terrain-conformance.js';
test('a narrow pavement triangle crossing a mild terrain crease must not become a steep face',()=>{
 const ground=(x,z)=>.01*Math.max(0,x+z-4)+.05*z;
 const array=new Float32Array([0,0,0,4,0,0,0,.2,4,4,.24,4]);
 const p={array,getX:i=>array[i*3],getZ:i=>array[i*3+2]};
 const partitionSurface=createPavementTerrainPartition([{userData:{isTerrainMesh:true},position:{x:0,z:0},geometry:{parameters:{widthSegments:1},attributes:{position:p}}}]);
 const mesh={vertices:[0,ground(0,3),3,2,ground(2,3.02),3.02,4,ground(4,3),3],curbVertices:[]};
 conformPavementMesh(mesh,ground,ground,{partitionSurface});
 assert.ok(mesh.vertices.length/9<=5,'terrain crease must not cause recursive geometry growth');
 let steepArea=0,totalArea=0;
 for(let i=0;i<mesh.vertices.length;i+=9){const p=mesh.vertices,a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9),u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);const ny=u[2]*v[0]-u[0]*v[2],area=Math.abs(ny)/2;if(area<1e-10)continue;totalArea+=area;const slope=Math.hypot(u[1]*v[2]-u[2]*v[1],u[0]*v[1]-u[1]*v[0])/Math.abs(ny);if(slope>.3)steepArea+=area;}
 assert.ok(Math.abs(totalArea-.04)<1e-8);
 assert.ok(steepArea<.0001,`steep pavement area ${steepArea} of ${totalArea}`);
});

test('terrain partition preserves world coordinates and never drops uncovered pavement',()=>{
 const array=new Float32Array([0,0,0,4,0,0,0,0,4,4,0,4]);
 const partition=createPavementTerrainPartition([{userData:{isTerrainMesh:true},position:{x:100,z:-80},geometry:{parameters:{widthSegments:1},attributes:{position:{array,getX:i=>array[i*3],getZ:i=>array[i*3+2]}}}}]);
 const result=partition([101,2,-79,102,2,-79,101,2,-78],()=>2);
 assert.ok(result.length>=9);
 for(let i=0;i<result.length;i+=3){assert.ok(result[i]>=101&&result[i]<=102);assert.equal(result[i+1],2);assert.ok(result[i+2]>=-79&&result[i+2]<=-78);}
 assert.equal(partition([99,2,-79,102,2,-79,101,2,-78],()=>2),null);
 partition.dispose();
 assert.equal(partition([101,2,-79,102,2,-79,101,2,-78],()=>2),null,'disposed partitions must release copied near support too');
});
