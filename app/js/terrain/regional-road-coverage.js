import { shortbreadFeatureTags } from '../world/shortbread-source.js?v=20';
import { normalizedCrossSection } from '../world/compiler/transport-source-normalizer.js?v=4';
import { createPavementTerrainMask } from '../world/pavement-terrain-mask.js';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';

const CELL_SIZE = 256;
const MAX_SEGMENTS = 1000000;
const MAX_CELLS = 24000;
const ROAD_TYPES = new Set(['motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','service','road']);
const present = value => value != null && !['','no','false','0','none'].includes(String(value).toLowerCase());
export function regionalRoadSurfacePolicy(properties) {
  const tags = shortbreadFeatureTags('streets', properties);
  if (!tags?.highway || !ROAD_TYPES.has(tags.highway.replace(/_link$/, ''))) return null;
  // A terrain colour cannot represent a bridge deck, tunnel or covered road.
  // Those remain solely with the transport geometry/physical surface owner.
  if (present(tags.bridge) || present(tags.tunnel) || present(tags.covered) ||
      present(tags.layer) || tags.location === 'underground' || present(tags.indoor)) return {role:'structure'};
  const section = normalizedCrossSection(tags);
  return {role:'surface',widthMeters:section.widthMeters,widthSource:section.widthSource};
}

// Liang–Barsky clipping prevents an out-of-window segment (or a long diagonal)
// from allocating every cell in its bounding rectangle as live road coverage.
export function clipRoadSegment(x0,z0,x1,z1,bounds) {
  const dx=x1-x0,dz=z1-z0;let lo=0,hi=1;
  for(const [p,q] of [[-dx,x0-bounds.minX],[dx,bounds.maxX-x0],[-dz,z0-bounds.minZ],[dz,bounds.maxZ-z0]]){
    if(p===0){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [x0+lo*dx,z0+lo*dz,x0+hi*dx,z0+hi*dz];
}

export function createRegionalRoadCoveragePlan({bounds,geoToWorld,unitsPerMeter=1,maxSegments=MAX_SEGMENTS}={}) {
  if(!bounds || !Object.values(bounds).every(Number.isFinite) || typeof geoToWorld!=='function' || !(unitsPerMeter>0))throw new TypeError('Invalid regional road frame');
  const cells=new Map();
  const stats={sourceLines:0,surfaceLines:0,structureLines:0,outsideLines:0,invalidLines:0,segments:0,cellSegments:0,cells:0,budgetExceeded:false,
    source:'openstreetmap-shortbread',representation:'terrain surface colour',physicsOwner:'compiled transport',cellSize:CELL_SIZE};
  let retired=false;
  function addGeometry(geometry,properties) {
    if(retired)throw new Error('Regional road inputs already retired');
    const policy=regionalRoadSurfacePolicy(properties);if(!policy)return;
    const lines=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
    for(const line of lines){
      stats.sourceLines++;
      if(policy.role==='structure'){stats.structureLines++;continue;}
      // Do not join across malformed nodes and invent a connection.
      if(!Array.isArray(line)||line.length<2||line.some(p=>!Array.isArray(p)||!p.slice(0,2).every(Number.isFinite)||p.length<2)){
        stats.invalidLines++;continue;
      }
      const width=policy.widthMeters*unitsPerMeter,pad=width*.5;let segments=0;
      let previous=geoToWorld(line[0][1],line[0][0]);
      for(let i=1;i<line.length;i++){
        const point=geoToWorld(line[i][1],line[i][0]);
        const segment=clipRoadSegment(previous.x,previous.z,point.x,point.z,bounds);previous=point;
        if(!segment || Math.hypot(segment[2]-segment[0],segment[3]-segment[1])<.001)continue;
        segments++;
        if(stats.segments>=maxSegments){stats.budgetExceeded=true;continue;}
        stats.segments++;
        const [x0,z0,x1,z1]=segment;
        const minX=Math.floor((Math.min(x0,x1)-pad)/CELL_SIZE),maxX=Math.floor((Math.max(x0,x1)+pad)/CELL_SIZE);
        const minZ=Math.floor((Math.min(z0,z1)-pad)/CELL_SIZE),maxZ=Math.floor((Math.max(z0,z1)+pad)/CELL_SIZE);
        for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){
          const clipped=clipRoadSegment(x0,z0,x1,z1,{minX:ix*CELL_SIZE-pad,maxX:(ix+1)*CELL_SIZE+pad,minZ:iz*CELL_SIZE-pad,maxZ:(iz+1)*CELL_SIZE+pad});
          if(!clipped)continue;
          const key=`${ix}:${iz}`;let bucket=cells.get(key);
          if(!bucket){if(cells.size>=MAX_CELLS){stats.budgetExceeded=true;continue;}bucket=[];cells.set(key,bucket);}
          // Bound references too: a malformed long segment must not defeat the
          // source-segment ceiling by spanning thousands of cells.
          if(stats.cellSegments>=MAX_SEGMENTS*2){stats.budgetExceeded=true;continue;}
          bucket.push([...clipped,width]);stats.cellSegments++;
        }
      }
      if(segments)stats.surfaceLines++;else stats.outsideLines++;
    }
    stats.cells=cells.size;
  }
  return {cells,stats,addGeometry,dispose(){cells.clear();retired=true;}};
}

export async function buildRegionalRoadCoverageMask(appCtx,plan,{signal,yieldWork=yieldToMainThread,now=()=>performance.now()}={}) {
  if (plan?.packet?.error) { const error = new Error(plan.packet.error); plan.dispose(); throw error; }
  if(!plan?.cells?.size && !plan?.packet?.keys?.length){plan?.dispose();return null;}
  let mask=null;
  try{
    signal?.throwIfAborted();
    if(plan.stats.budgetExceeded)throw new Error('Regional surface-road coverage exceeded its bounded input budget');
    mask=createPavementTerrainMask(appCtx,plan.packet?.keys || [...plan.cells.keys()],{kind:'road',cellSize:CELL_SIZE,color:[.19,.205,.22],deferUpload:true});
    const size=mask.layout.resolution;
    if (plan.packet) {
      const {keys,masks,layout} = plan.packet;
      if (layout.resolution !== size || masks.length !== keys.length * size * size) throw new Error('Regional road worker layout mismatch');
      let slice = now();
      for (let i=0;i<keys.length;i++) {
        signal?.throwIfAborted();
        mask.publish(keys[i],masks.subarray(i*size*size,(i+1)*size*size));
        if(now()-slice>=8){await yieldWork();signal?.throwIfAborted();slice=now();}
      }
      mask.finishBulkUpload();
      return {mask,stats:{...plan.stats,status:'ready',retainedBytes:mask.bytes,worldUnitsPerTexel:CELL_SIZE/size,compiler:'worker-raster'}};
    }
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(size,size):document.createElement('canvas');
    canvas.width=canvas.height=size;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Road coverage canvas unavailable');
    context.strokeStyle='#ffffff';context.lineCap='round';context.lineJoin='round';
    let slice=now();
    for(const [key,segments] of plan.cells){
      signal?.throwIfAborted();
      const [ix,iz]=key.split(':').map(Number),scale=size/CELL_SIZE;
      context.clearRect(0,0,size,size);
      for(const [x0,z0,x1,z1,width] of segments){
        context.lineWidth=width*scale;context.beginPath();
        context.moveTo((x0-ix*CELL_SIZE)*scale,(z0-iz*CELL_SIZE)*scale);
        context.lineTo((x1-ix*CELL_SIZE)*scale,(z1-iz*CELL_SIZE)*scale);context.stroke();
        if(now()-slice>=8){await yieldWork();signal?.throwIfAborted();slice=now();}
      }
      const pixels=context.getImageData(0,0,size,size).data,coverage=new Uint8Array(size*size);
      for(let i=0;i<coverage.length;i++)coverage[i]=pixels[i*4+3];
      mask.publish(key,coverage);plan.cells.delete(key);
      if(now()-slice>=8){await yieldWork();signal?.throwIfAborted();slice=now();}
    }
    mask.finishBulkUpload();
    const stats={...plan.stats,status:'ready',retainedBytes:mask.bytes,worldUnitsPerTexel:CELL_SIZE/size};
    return {mask,stats};
  }catch(error){mask?.dispose();throw error;}
  finally{plan.dispose();}
}
