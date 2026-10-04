import {drainCooperatively} from './cooperative-scheduling.js?v=1';
import {appendCollisionCandidate} from '../physics/collision-candidates.js';
// Candidate index only. The existing building/obstacle solver owns response.
const caches = new WeakMap();
const CELL = 64;
function* vegetationObstacleIndexSteps(ctx, features) {
    const cells = new Map();
    for (const tree of features) {
      yield;
      if (tree.trunkRadius === 0) continue;
      if (!Number.isFinite(tree.x) || !Number.isFinite(tree.z)) continue;
      const scale=Math.max(.65,Number(tree.scale)||1), r=Number.isFinite(tree.trunkRadius) ? tree.trunkRadius : .42*scale;
      if (!Number.isFinite(scale) || scale > 100) continue;
      const baseY=Number.isFinite(tree.baseY) ? tree.baseY : Number(ctx.terrainMeshHeightAt?.(tree.x,tree.z));
      if(!Number.isFinite(baseY)) continue;
      const pts=Array.from({length:8},(_,i)=>({x:tree.x+Math.cos(i*Math.PI/4)*r,z:tree.z+Math.sin(i*Math.PI/4)*r}));
      const collider={pts,minX:tree.x-r,maxX:tree.x+r,minZ:tree.z-r,maxZ:tree.z+r,minY:baseY,maxY:baseY+(tree.trunkHeight ?? 4.6*scale),kind:'vegetation_trunk',sourceBuildingId:tree.id||`tree:${tree.x}:${tree.z}`};
      for(let ix=Math.floor(collider.minX/CELL);ix<=Math.floor(collider.maxX/CELL);ix++) for(let iz=Math.floor(collider.minZ/CELL);iz<=Math.floor(collider.maxZ/CELL);iz++) {
        const key=`${ix}:${iz}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(collider);
      }
    }
  return {features,cells};
}

export function prepareVegetationObstacleIndex(ctx,features,schedule) {
  return drainCooperatively(vegetationObstacleIndexSteps(ctx,features),schedule);
}
export function publishVegetationObstacleIndex(ctx,index) {
  if(index.features!==ctx.vegetationFeatures)throw new Error('Vegetation contact publication must match visual features');
  caches.set(ctx,index);
}

export function nearbyVegetationObstacles(ctx, x, z, radius = 2, candidates = null) {
  if (!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius < 0 || radius > 256) return candidates || [];
  if (ctx.isEnv && ctx.ENV && !ctx.isEnv(ctx.ENV.EARTH)) return candidates || [];
  const features = ctx.vegetationFeatures;
  if (!Array.isArray(features) || !features.length) return candidates || [];
  let cache = caches.get(ctx);
  if (!cache || cache.features !== features) {
    const steps=vegetationObstacleIndexSteps(ctx,features);
    for (;;) {const result=steps.next();if(result.done){cache=result.value;break;}}
    caches.set(ctx,cache);
  }
  const result=candidates?null:new Set();
  for(let ix=Math.floor((x-radius)/CELL);ix<=Math.floor((x+radius)/CELL);ix++) {
    for(let iz=Math.floor((z-radius)/CELL);iz<=Math.floor((z+radius)/CELL);iz++) {
      const bucket=cache.cells.get(`${ix}:${iz}`);if(!bucket)continue;
      for(let i=0;i<bucket.length;i++) {
        if(candidates)appendCollisionCandidate(candidates,bucket[i]);
        else result.add(bucket[i]);
      }
    }
  }
  return candidates || [...result];
}
