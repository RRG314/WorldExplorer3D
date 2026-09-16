import {createPavementTerrainPartition} from '../../app/js/world/pavement-terrain-partition.js';
import {prepareStreetPavement,compilePavementTile,meshPavementTile} from '../../app/js/world/compiler/street-pavement.js';
import {conformPavementMesh} from '../../app/js/world/pavement-terrain-conformance.js';

export function terrainSampler(grid){return (x,z)=>{
 const fx=Math.max(0,Math.min(grid.size-1,(x-grid.minX)/grid.step)),fz=Math.max(0,Math.min(grid.size-1,(z-grid.minZ)/grid.step));
 const col=Math.min(grid.size-2,Math.floor(fx)),row=Math.min(grid.size-2,Math.floor(fz)),a=fx-col,b=fz-row,n=grid.size;
 const p=grid.heights[row*n+col],q=grid.heights[row*n+col+1],r=grid.heights[(row+1)*n+col],s=grid.heights[(row+1)*n+col+1];
 return a+b<=1?p+(q-p)*a+(r-p)*b:(1-a)*r+(1-b)*q+(a+b-1)*s;
};}
export function compileQualityCase(fixture){
 const started=performance.now(),ground=terrainSampler(fixture.terrain),mpu=fixture.input.metersPerWorldUnit;
 const grid=fixture.terrain,terrainPositions=new Float32Array(grid.size*grid.size*3);
 for(let row=0;row<grid.size;row++)for(let col=0;col<grid.size;col++){const i=(row*grid.size+col)*3;terrainPositions[i]=grid.minX+col*grid.step;terrainPositions[i+1]=grid.heights[row*grid.size+col];terrainPositions[i+2]=grid.minZ+row*grid.step;}
 const partitionSurface=createPavementTerrainPartition([{userData:{isTerrainMesh:true},position:{x:0,z:0},geometry:{parameters:{widthSegments:grid.size-1},attributes:{position:{array:terrainPositions,getX:i=>terrainPositions[i*3],getZ:i=>terrainPositions[i*3+2]}}}}]);
 const plan=prepareStreetPavement(fixture.input),meshes=[],failures=[];let area=0,triangles=0,refinements=0,minClearance=Infinity,maxClearance=-Infinity,frontages=0;
 for(const tile of plan.tiles){
  const result=compilePavementTile(tile,mpu);frontages+=result.inferredFrontages;
  const base=(x,z)=>ground(x,z)+.018,top=(x,z)=>base(x,z)+.12/mpu;
  // Test physical ground clearance independently of a road-contact bonus.
  // This is the lowest ordinary sidewalk elevation used by the runtime.
  const mesh=meshPavementTile(tile,result.polygons,base,{curbHeight:.12/mpu});
  refinements+=conformPavementMesh(mesh,base,top,{partitionSurface});meshes.push(mesh);
  const p=mesh.vertices;triangles+=p.length/9;
  for(let i=0;i<p.length;i+=9){
   const ax=p[i],az=p[i+2],bx=p[i+3],bz=p[i+5],cx=p[i+6],cz=p[i+8];
   area+=Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))/2;
   if((bx-ax)*(cz-az)-(bz-az)*(cx-ax)>1e-7)failures.push('downward triangle');
   for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
    let x=0,y=0,z=0;for(let j=0;j<3;j++){x+=weights[j]*p[i+j*3];y+=weights[j]*p[i+j*3+1];z+=weights[j]*p[i+j*3+2];}
    const clearance=y-ground(x,z);minClearance=Math.min(minClearance,clearance);maxClearance=Math.max(maxClearance,clearance);
    if(!Number.isFinite(clearance)||clearance<.02)failures.push('terrain penetrates sidewalk');
   }
  }
 }
 if(!triangles)failures.push('no pavement');if(!frontages)failures.push('no supported frontages');
 if(triangles>30000)failures.push('triangle budget exceeded');
 if(performance.now()-started>10000)failures.push('component compilation exceeded 10 seconds');
 return {meshes,ground,report:{name:fixture.name,pass:failures.length===0,failures:[...new Set(failures)],tiles:plan.tiles.length,roads:fixture.input.roads.length,buildings:fixture.input.buildings.length,triangles,area,refinements,frontages,minClearance,maxClearance,elevationRangeMeters:(Math.max(...fixture.terrain.heights)-Math.min(...fixture.terrain.heights))*mpu,durationMs:Math.round(performance.now()-started)}};
}
export function shiftedCase(fixture,dx,dz){
 const out=structuredClone(fixture),shift=p=>({x:p.x+dx,z:p.z+dz});out.name+=` translated ${dx},${dz}`;
 for(const key of ['roads','buildings','landuses','linearFeatures'])for(const f of out.input[key]){f.pts=f.pts.map(shift);if(f.holes)f.holes=f.holes.map(r=>r.map(shift));}
 const b=out.input.coverageBounds;b.minX+=dx;b.maxX+=dx;b.minZ+=dz;b.maxZ+=dz;out.terrain.minX+=dx;out.terrain.minZ+=dz;return out;
}
export function rotatedCase(fixture){
 const out=structuredClone(fixture),rotate=p=>({x:-p.z,z:p.x});out.name+=' rotated 90 degrees';
 for(const key of ['roads','buildings','landuses','linearFeatures'])for(const f of out.input[key]){f.pts=f.pts.map(rotate);if(f.holes)f.holes=f.holes.map(r=>r.map(rotate));}
 const n=out.terrain.size,src=fixture.terrain.heights;out.terrain.heights=Array.from({length:n*n},(_,i)=>src[(n-1-i%n)*n+Math.floor(i/n)]);return out;
}
