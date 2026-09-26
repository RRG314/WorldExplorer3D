import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {prepareStreetPavement,compilePavementTile} from '../../app/js/world/compiler/street-pavement.js';
import {createStreetPolygonKernel,STREET_POLYGON_GRID_WORLD} from '../../app/js/world/compiler/street-polygon-kernel.js';
// Compare published millimetre-grid outlines on a micrometre grid. Reusing
// production quantization here can change the geometry being measured.
const COMPARISON_GRID_WORLD=0.000001;
const clip=createStreetPolygonKernel({grid:COMPARISON_GRID_WORLD});
const area=polys=>polys.reduce((sum,p)=>sum+p.reduce((total,r,index)=>{const [ox,oz]=r[0];let value=0;for(let i=1;i<r.length;i++)value+=(r[i-1][0]-ox)*(r[i][1]-oz)-(r[i][0]-ox)*(r[i-1][1]-oz);return total+Math.abs(value)/2*(index?-1:1);},0),0);
const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
const boundary=b=>[[[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[b.minX,b.minZ]]];
// Retain raw differences and reject changes outside the frozen
// 0.002-world-unit boundary allowance, including when a comparison re-clips.
function sampledBoundaryDistance(source,target){
  const edges=polys=>polys.flatMap(p=>p.flatMap(r=>r.slice(1).map((b,i)=>[r[i],b])));
  const targets=edges(target);let maximum=0;
  for(const [a,b] of edges(source)){
    const count=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
    for(let i=0;i<=count;i++){
      const x=a[0]+(b[0]-a[0])*i/count,z=a[1]+(b[1]-a[1])*i/count;let nearest=Infinity;
      for(const [c,d] of targets){
        const dx=d[0]-c[0],dz=d[1]-c[1],lengthSq=dx*dx+dz*dz;
        const t=lengthSq?Math.max(0,Math.min(1,((x-c[0])*dx+(z-c[1])*dz)/lengthSq)):0;
        nearest=Math.min(nearest,Math.hypot(x-c[0]-t*dx,z-c[1]-t*dz));
      }
      maximum=Math.max(maximum,nearest);
    }
  }
  return maximum;
}
export function pavementPartitionDifference(expected,actual){
  const allowance=.002;
  const differenceArea=area(expected.length?clip.difference(expected,actual):[])+area(actual.length?clip.difference(actual,expected):[]);
  const missing=expected.length?clip.difference(expected,actual.length?clip.offset(actual,allowance):[]):[];
  const added=actual.length?clip.difference(actual,expected.length?clip.offset(expected,allowance):[]):[];
  return {differenceArea,beyondRoundingArea:area(missing)+area(added),maximumSampledBoundaryDistance:Math.max(sampledBoundaryDistance(expected,actual),sampledBoundaryDistance(actual,expected))};
}
export function replayStreetLayout(input,{sizes=[64,32,128]}={}){
  let reference;const reports=[];
  for(const chunkSize of sizes){
    const start=performance.now(),plan=prepareStreetPavement({...input,chunkSize});
    const tiles=plan.tiles.map(tile=>({bounds:tile.bounds,polygons:compilePavementTile(tile,input.metersPerWorldUnit).polygons}));
    let differenceArea=0,beyondRoundingArea=0,maximumSampledBoundaryDistance=0;const differences=[];
    if(reference)for(const tile of reference){
      const candidates=tiles.filter(t=>overlaps(t.bounds,tile.bounds)).flatMap(t=>t.polygons);
      const actual=candidates.length?clip.intersection(candidates,boundary(tile.bounds)):[];
      const delta=pavementPartitionDifference(tile.polygons,actual);
      differenceArea+=delta.differenceArea;beyondRoundingArea+=delta.beyondRoundingArea;maximumSampledBoundaryDistance=Math.max(maximumSampledBoundaryDistance,delta.maximumSampledBoundaryDistance);
      if(delta.differenceArea>1e-5)differences.push({bounds:tile.bounds,...delta});
    }
    reports.push({chunkSize,tiles:tiles.length,area:tiles.reduce((sum,t)=>sum+area(t.polygons),0),milliseconds:performance.now()-start,differenceArea,beyondRoundingArea,maximumSampledBoundaryDistance,differences:differences.sort((a,b)=>b.differenceArea-a.differenceArea).slice(0,12)});
    reference??=tiles;
  }
  return {scope:'Complete saved layout extent; horizontal pavement partition invariance only. Does not certify heights, movement or missing source data.',sourceOutlineGridWorld:.001,booleanGridWorld:STREET_POLYGON_GRID_WORLD,comparisonGridWorld:COMPARISON_GRID_WORLD,boundaryAllowanceWorld:.002,coverageBounds:input.coverageBounds,sourceCounts:Object.fromEntries(['roads','buildings','landuses','linearFeatures'].map(k=>[k,input[k]?.length||0])),reports};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const input=JSON.parse(await readFile(process.argv[2],'utf8'));
  const result=replayStreetLayout(input);console.log(JSON.stringify(result,null,2));
  if(result.reports.some(r=>r.beyondRoundingArea>1e-5))process.exitCode=1;
}
