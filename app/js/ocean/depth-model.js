export const OCEAN_DEPTH_MODEL=Object.freeze({LEGACY:'authored-depth-v1',GEOGRAPHIC:'geographic-metres-v1'});
export function normalizeOceanDepthProfile(profile){
 if(profile?.model===OCEAN_DEPTH_MODEL.LEGACY)return Object.freeze({model:OCEAN_DEPTH_MODEL.LEGACY});
 if(profile?.model!==OCEAN_DEPTH_MODEL.GEOGRAPHIC||!Number.isFinite(profile.entryDepthMeters)||profile.entryDepthMeters<5||profile.entryDepthMeters>12000)return null;
 return Object.freeze({model:OCEAN_DEPTH_MODEL.GEOGRAPHIC,entryDepthMeters:profile.entryDepthMeters});
}
export function geographicBottomY(elevationMeters,metersPerWorldUnit){
 if(!Number.isFinite(elevationMeters)||!Number.isFinite(metersPerWorldUnit)||metersPerWorldUnit<=0)return null;
 return elevationMeters/metersPerWorldUnit;
}
// Rendering extension only. The evidence sampler keeps missing/outside cells
// unknown. Extend an accepted grid at its edge rather than create a fake shallow
// wall where a finite scene's bathymetry ends. Missing grid nodes use a bounded
// inverse-distance reconstruction; none of these values becomes source evidence.
export function extendPresentationDepth(grid,x,z,entryDepthMeters){
 if(!grid||!Number.isInteger(grid.size)||grid.size<2||!Number.isFinite(grid.extent)||grid.extent<=0||!Array.isArray(grid.values)||grid.values.length!==grid.size**2)return -entryDepthMeters;
 const gx=Math.max(0,Math.min(grid.size-1,(x+grid.extent)/(grid.extent*2)*(grid.size-1)));
 const gz=Math.max(0,Math.min(grid.size-1,(z+grid.extent)/(grid.extent*2)*(grid.size-1)));
 function node(ix,iz){
  const actual=grid.values[iz*grid.size+ix];if(Number.isFinite(actual))return actual;
  let total=0,weight=0;
  for(let row=0;row<grid.size;row++)for(let col=0;col<grid.size;col++){
   const value=grid.values[row*grid.size+col];if(!Number.isFinite(value))continue;
   const w=1/Math.max(.01,(col-ix)**2+(row-iz)**2);total+=value*w;weight+=w;
  }
  return weight?total/weight:-entryDepthMeters;
 }
 const x0=Math.floor(gx),z0=Math.floor(gz),x1=Math.min(grid.size-1,x0+1),z1=Math.min(grid.size-1,z0+1),fx=gx-x0,fz=gz-z0;
 return node(x0,z0)*(1-fx)*(1-fz)+node(x1,z0)*fx*(1-fz)+node(x0,z1)*(1-fx)*fz+node(x1,z1)*fx*fz;
}
