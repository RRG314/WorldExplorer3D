import {drainCooperatively} from '../world/cooperative-scheduling.js?v=1';
import { projectDecalTriangle } from './surface-decal-projection.js';

export function selectLinearWalkContactMeshes(meshes=[]) {
  return meshes.filter(mesh=>{
    const kind=mesh.userData?.linearFeatureKind||mesh.userData?.linearFeatureRef?.kind;
    return mesh.visible!==false&&['footway','cycleway','path','steps'].includes(kind);
  });
}

export function refreshLinearWalkContactIndex(appCtx) {
  const next=createRoadContactIndex(selectLinearWalkContactMeshes(appCtx.linearFeatureMeshes));
  appCtx.linearWalkContactIndex?.dispose();
  appCtx.linearWalkContactIndex=next;
  return next;
}

// The index owns compact references to published geometry, not one JS object
// per triangle. Point queries allocate no triangle objects; decal clipping
// materializes only the small candidate set it actually visits.
function* roadContactIndexSteps(meshes, cellSize = 16, {bounds} = {}) {
  if(!Number.isFinite(cellSize)||cellSize<=0)throw new RangeError('Contact cell size must be positive');
  const cells=new Map(),sources=[],modes=[],modeCodes=new Map();
  const descriptors=[];
  let capacity=0;
  for(const mesh of meshes) {
    if(mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking)continue;
    const positions=(mesh.geometry?.getAttribute?.('position') || mesh.geometry?.attributes?.position)?.array;
    const indices=mesh.geometry?.getIndex?.()?.array;
    if(!positions)continue;
    const sourceCount=Math.floor((indices?.length ?? positions.length/3)/3);
    let selected=null;
    if(bounds){
      selected=[];
      for(let triangle=0;triangle<sourceCount;triangle++){
        if(triangle%128===0)yield;
        const i=triangle*3,a=indices?indices[i]*3:i*3,b=indices?indices[i+1]*3:a+3,c=indices?indices[i+2]*3:a+6;
        if(Math.max(positions[a],positions[b],positions[c])<bounds.minX || Math.min(positions[a],positions[b],positions[c])>bounds.maxX ||
          Math.max(positions[a+2],positions[b+2],positions[c+2])<bounds.minZ || Math.min(positions[a+2],positions[b+2],positions[c+2])>bounds.maxZ)continue;
        selected.push(triangle);
      }
      selected=Uint32Array.from(selected);
    }
    const count=selected?.length ?? sourceCount;
    if(count){descriptors.push({mesh,positions,indices,count,selected});capacity+=count;}
  }
  // Five integers: source array, a, b, c, terrain mode. Float64 preserves the
  // original barycentric denominator calculation exactly.
  let records=new Uint32Array(capacity*5),denominators=new Float64Array(capacity);
  let triangleCount=0,cellReferences=0,bucketBytes=0;
  let buckets=new Uint32Array();
  for(const {mesh,positions,indices,count,selected} of descriptors) {
    const sourceIndex=sources.length;sources.push(positions);
    const ranges=mesh.userData?.surfaceRanges || [];
    let rangeIndex=0;
    for(let triangle=0;triangle<count;triangle++) {
      if(triangle%128===0)yield;
      const i=(selected ? selected[triangle] : triangle)*3;
      const a=indices ? indices[i]*3 : i*3;
      const b=indices ? indices[i+1]*3 : a+3;
      const c=indices ? indices[i+2]*3 : a+6;
      const ax=positions[a],az=positions[a+2],bx=positions[b],bz=positions[b+2],cx=positions[c],cz=positions[c+2];
      const denominator=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(!Number.isFinite(denominator)||Math.abs(denominator)<1e-9)continue;
      while(rangeIndex+1<ranges.length&&i>=ranges[rangeIndex].start+ranges[rangeIndex].count)rangeIndex++;
      const range=ranges[rangeIndex];
      const mode=range&&i>=range.start&&i<range.start+range.count ? range.terrainMode : mesh.userData?.terrainMode;
      if(!modeCodes.has(mode)){modeCodes.set(mode,modes.length);modes.push(mode);}
      const id=triangleCount++,offset=id*5;
      records[offset]=sourceIndex;records[offset+1]=a;records[offset+2]=b;records[offset+3]=c;records[offset+4]=modeCodes.get(mode);
      denominators[id]=denominator;
      for(let x=Math.floor(Math.min(ax,bx,cx)/cellSize);x<=Math.floor(Math.max(ax,bx,cx)/cellSize);x++) {
        for(let z=Math.floor(Math.min(az,bz,cz)/cellSize);z<=Math.floor(Math.max(az,bz,cz)/cellSize);z++) {
          const key=`${x}:${z}`;
          cells.set(key,(cells.get(key)||0)+1);cellReferences++;
          if(cellReferences%512===0)yield;
        }
      }
    }
  }
  // One contiguous allocation replaces one JS array and one typed array per
  // spatial cell. Count first, assign offsets, then fill in original order.
  buckets=new Uint32Array(cellReferences+cells.size);
  let cursor=0,filledReferences=0;
  for(const [key,count] of cells){cells.set(key,cursor);cursor+=count+1;yield;}
  for(let id=0;id<triangleCount;id++) {
    const offset=id*5,p=sources[records[offset]],a=records[offset+1],b=records[offset+2],c=records[offset+3];
    for(let x=Math.floor(Math.min(p[a],p[b],p[c])/cellSize);x<=Math.floor(Math.max(p[a],p[b],p[c])/cellSize);x++) {
      for(let z=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/cellSize);z<=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/cellSize);z++) {
        const start=cells.get(`${x}:${z}`);
        buckets[start+1+buckets[start]++]=id;
        if(++filledReferences%512===0)yield;
      }
    }
    if(id%128===0)yield;
  }
  bucketBytes=buckets.byteLength;
  // No compilation-only mesh/indices references survive the constructor.
  descriptors.length=0;modeCodes.clear();
  return {
    stats(){return {triangles:triangleCount,cells:cells.size,cellReferences,bucketAllocations:buckets.length ? 1 : 0,recordBytes:records.byteLength+denominators.byteLength,bucketBytes};},
    dispose(){buckets=new Uint32Array();cells.clear();sources.length=0;modes.length=0;records=new Uint32Array();denominators=new Float64Array();triangleCount=0;cellReferences=0;bucketBytes=0;},
    // Diagnostic distance to actual uploaded tops, not an expanded collision
    // surface. Callers supply an explicit bound and retain the measured distance.
    nearestSurfaceAt(x,z,maxDistance,requiredTerrainMode=null) {
      if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new RangeError('Invalid surface distance bound');
      let best = null;
      for (let ix=Math.floor((x-maxDistance)/cellSize);ix<=Math.floor((x+maxDistance)/cellSize);ix++) {
        for (let iz=Math.floor((z-maxDistance)/cellSize);iz<=Math.floor((z+maxDistance)/cellSize);iz++) {
          const start=cells.get(`${ix}:${iz}`);
          if(start===undefined)continue;
          for(let i=start+1,end=i+buckets[start];i<end;i++) {
            const id=buckets[i],offset=id*5;
            if(requiredTerrainMode&&modes[records[offset+4]]!==requiredTerrainMode)continue;
            const p=sources[records[offset]],a=records[offset+1],b=records[offset+2],c=records[offset+3];
            const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/denominators[id];
            const v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/denominators[id];
            if(u>=0&&v>=0&&u+v<=1)return {distance:0,x,z,y:u*p[a+1]+v*p[b+1]+(1-u-v)*p[c+1]};
            for(let edge=0;edge<3;edge++) {
              const from=edge===0?a:edge===1?b:c,to=edge===0?b:edge===1?c:a;
              const dx=p[to]-p[from],dz=p[to+2]-p[from+2],lengthSquared=dx*dx+dz*dz;
              const t=lengthSquared?Math.max(0,Math.min(1,((x-p[from])*dx+(z-p[from+2])*dz)/lengthSquared)):0;
              const px=p[from]+t*dx,pz=p[from+2]+t*dz,distance=Math.hypot(px-x,pz-z);
              if(distance<=maxDistance&&(!best||distance<best.distance))best={distance,x:px,z:pz,y:p[from+1]+t*(p[to+1]-p[from+1])};
            }
          }
        }
      }
      return best;
    },
    projectTriangle(points,lift=.012,requiredTerrainMode=null) {
      const candidates=new Set(),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
      for(let ix=Math.floor(Math.min(...xs)/cellSize);ix<=Math.floor(Math.max(...xs)/cellSize);ix++)
        for(let iz=Math.floor(Math.min(...zs)/cellSize);iz<=Math.floor(Math.max(...zs)/cellSize);iz++)
          {
            const start=cells.get(`${ix}:${iz}`);
            if(start===undefined)continue;
            for(let i=start+1,end=i+buckets[start];i<end;i++) {
              const id=buckets[i];
              if(!requiredTerrainMode||modes[records[id*5+4]]===requiredTerrainMode)candidates.add(id);
            }
          }
      function* supports(){for(const id of candidates){const offset=id*5;yield {positions:sources[records[offset]],a:records[offset+1],b:records[offset+2],c:records[offset+3],denominator:denominators[id]};}}
      return projectDecalTriangle(points,supports(),lift);
    },
    sampleAt(x,z,referenceY=NaN,requiredTerrainMode=null) {
      const start=cells.get(`${Math.floor(x/cellSize)}:${Math.floor(z/cellSize)}`);
      if(start===undefined)return null;
      let best=null;
      for(let i=start+1,end=i+buckets[start];i<end;i++) {
        const id=buckets[i];
        const offset=id*5;
        if(requiredTerrainMode&&modes[records[offset+4]]!==requiredTerrainMode)continue;
        const p=sources[records[offset]],a=records[offset+1],b=records[offset+2],c=records[offset+3],denominator=denominators[id];
        const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/denominator;
        const v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/denominator;
        if(u < -1e-6 || v < -1e-6 || u+v>1.000001)continue;
        const y=u*p[a+1]+v*p[b+1]+(1-u-v)*p[c+1];
        if(!Number.isFinite(y))continue;
        if(best===null||(Number.isFinite(referenceY)?Math.abs(y-referenceY)<Math.abs(best-referenceY):y>best))best=y;
      }
      return best;
    }
  };
}


export function createRoadContactIndex(meshes,cellSize=16,options={}){
 const steps=roadContactIndexSteps(meshes,cellSize,options);let result;
 do{result=steps.next();}while(!result.done);
 return result.value;
}
export function createRoadContactIndexCooperatively(meshes,cellSize=16,options={}){
 return drainCooperatively(roadContactIndexSteps(meshes,cellSize,options),options);
}
