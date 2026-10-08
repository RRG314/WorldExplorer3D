import {TRANSPORT_REGION_SIZE,transportRegionKey} from './transport-detail-plan.js';

// Regions do not overlap. Structures and the initial neighborhood retain the
// original index; each committed distant region adds its own immutable index.
export function createRegionalRoadContact(base) {
  const regions=new Map();
  function selected(minX,maxX,minZ,maxZ){
    const result=[base];
    for(let x=Math.floor(minX/TRANSPORT_REGION_SIZE);x<=Math.floor(maxX/TRANSPORT_REGION_SIZE);x++)
      for(let z=Math.floor(minZ/TRANSPORT_REGION_SIZE);z<=Math.floor(maxZ/TRANSPORT_REGION_SIZE);z++){
        const index=regions.get(`${x}:${z}`);if(index)result.push(index);
      }
    return result;
  }
  const projectPolygon=(points,lift=.012,mode=null)=>{
    const xs=points.map(p=>p.x),zs=points.map(p=>p.z),output=[];
    for(const index of selected(Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)))
      for(const value of index.projectPolygon(points,lift,mode))output.push(value);
    return output;
  };
  return {
    add(key,index){if(regions.has(key))throw new Error(`Duplicate road contact region ${key}`);regions.set(key,index);},
    remove(key){const index=regions.get(key);if(!index)return false;regions.delete(key);index.dispose();return true;},
    stats(){const total={regions:regions.size};for(const index of [base,...regions.values()])for(const [key,value] of Object.entries(index.stats()))total[key]=(total[key]||0)+value;return total;},
    sampleAt(x,z,referenceY=NaN,mode=null){
      let best=null;
      for(const index of selected(x-1e-5,x+1e-5,z-1e-5,z+1e-5)){
        const y=index.sampleAt(x,z,referenceY,mode);
        if(Number.isFinite(y)&&(best===null||(Number.isFinite(referenceY)?Math.abs(y-referenceY)<Math.abs(best-referenceY):y>best)))best=y;
      }
      return best;
    },
    nearestSurfaceAt(x,z,distance,mode=null){
      if(!Number.isFinite(distance)||distance<0)throw new RangeError('Invalid surface distance bound');
      let best=null;
      for(const index of selected(x-distance,x+distance,z-distance,z+distance)){
        const candidate=index.nearestSurfaceAt(x,z,distance,mode);
        if(candidate&&(!best||candidate.distance<best.distance))best=candidate;
      }
      return best;
    },
    projectPolygon,projectTriangle:projectPolygon,
    dispose(){base.dispose();for(const index of regions.values())index.dispose();regions.clear();}
  };
}
