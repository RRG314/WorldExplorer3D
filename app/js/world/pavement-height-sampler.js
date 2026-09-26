import {drainCooperatively} from './cooperative-scheduling.js?v=1';
import {roadMetersPerWorldUnit} from './road-units.js';

// Near detail and distant areas use one accepted ground/road-edge contract.
// The memoized samples live only for one cell publication.
function* pavementBaseSamplerSteps({segments=[],ground,roadContactIndex,profileCache=new Map(),groundRevision=0}) {
  if(profileCache.ground!==ground || profileCache.contact!==roadContactIndex || profileCache.revision!==groundRevision){
    profileCache.clear();profileCache.ground=ground;profileCache.contact=roadContactIndex;profileCache.revision=groundRevision;
  }
  const prepared=[];
  for(const segment of segments){
    const scale=roadMetersPerWorldUnit(segment.road);
    const key=JSON.stringify([segment.a.x,segment.a.z,segment.b.x,segment.b.z,segment.wa,segment.wb,Number(segment.offset)||0,scale,segment.road?.surfaceBias??.18]);
    if(profileCache.has(key)){prepared.push(profileCache.get(key));yield;continue;}
    const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,length=Math.hypot(dx,dz)||1;
    const offset=Number(segment.offset)||0;
    const shift=p=>({x:p.x-dz/length*offset,z:p.z+dx/length*offset});
    const a=shift(segment.a),b=shift(segment.b);
    const clearance=p=>{
      const base=ground(p.x,p.z),height=roadContactIndex?.sampleAt(p.x,p.z,base,'at_grade');
      const bias=Number.isFinite(segment.road?.surfaceBias)?segment.road.surfaceBias:.18;
      return Math.max(bias,Number.isFinite(height)&&Number.isFinite(base)?height-base:bias);
    };
    const steps=Math.max(1,Math.ceil(length*scale));
    const left=new Float64Array(steps+1),right=new Float64Array(steps+1);
    for(let i=0;i<=steps;i++){
      if(i%16===0)yield;
      const t=i/steps,x=a.x+dx*t,z=a.z+dz*t,halfWidth=(segment.wa+(segment.wb-segment.wa)*t)/2;
      left[i]=clearance({x:x-dz/length*halfWidth,z:z+dx/length*halfWidth});
      right[i]=clearance({x:x+dz/length*halfWidth,z:z-dx/length*halfWidth});
    }
    const profile={...segment,a,b,blendDistance:8/scale,steps,left,right};
    prepared.push(profile);profileCache.set(key,profile);
  }
  const heights=new Map();
  return (x,z)=>{
    const key=`${x}:${z}`;
    if(heights.has(key))return heights.get(key);
    const terrain=ground(x,z);
    if(!Number.isFinite(terrain))throw new Error('Pavement has no accepted terrain height');
    let weightedClearance=0,weightSum=0;
    for(const s of prepared){
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,lengthSq=dx*dx+dz*dz;
      if(!(lengthSq>0))continue;
      const t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/lengthSq));
      const px=s.a.x+dx*t,pz=s.a.z+dz*t,distance=Math.hypot(x-px,z-pz);
      const halfWidth=(s.wa+(s.wb-s.wa)*t)/2;
      const edgeDistance=Math.max(0,distance-halfWidth);
      const blend=Math.max(0,1-edgeDistance/s.blendDistance);
      if(blend===0)continue;
      const weight=blend*blend/Math.max(1e-12,edgeDistance*edgeDistance);
      const profile=(x-px)*-dz+(z-pz)*dx>=0?s.left:s.right;
      const station=t*s.steps,index=Math.min(s.steps-1,Math.floor(station));
      const clearance=profile[index]+(profile[index+1]-profile[index])*(station-index);
      weightedClearance+=Math.max(.018,clearance)*blend*weight;
      weightSum+=weight;
    }
    // Road-edge clearance is a continuous field. Switching to the nearest
    // centerline made unequal-width streets create a step across their bisector;
    // sampling that step on a thin clipped triangle produced a steep face.
    const height=terrain+Math.max(.018,weightSum?weightedClearance/weightSum:0);
    if(!Number.isFinite(height))throw new Error('Pavement has no accepted surface height');
    heights.set(key,height);return height;
  };
}


export function createPavementBaseSampler(options){
 const steps=pavementBaseSamplerSteps(options);let result;
 do{result=steps.next();}while(!result.done);
 return result.value;
}
export function createPavementBaseSamplerCooperatively(options,schedule={}){
 return drainCooperatively(pavementBaseSamplerSteps(options),schedule);
}
