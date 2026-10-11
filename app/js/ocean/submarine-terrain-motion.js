import {SUBMARINE_BOUNDS,submarineVerticalClearance} from './submarine-envelope.js';

// Conservative rotated hull footprint. Sample the interior as well as its
// boundary: a narrow ridge can miss both the centre and the four corners.
export function submarineFloorLimit(pose,sampleFloor,{scale=.86,minimumClearance=1.6,lowerLimit=-Infinity}={}){
 const clearance=submarineVerticalClearance(pose.pitch||0,pose.roll||0,scale);
 const halfWidth=(Math.max(Math.abs(SUBMARINE_BOUNDS.min[0]),SUBMARINE_BOUNDS.max[0])+Math.abs(Math.sin(pose.roll||0))*SUBMARINE_BOUNDS.max[1])*scale;
 const halfLength=(Math.max(Math.abs(SUBMARINE_BOUNDS.min[2]),SUBMARINE_BOUNDS.max[2])+Math.abs(Math.sin(pose.pitch||0))*SUBMARINE_BOUNDS.max[1])*scale;
 const columns=Math.ceil(halfWidth*2/1.25),rows=Math.ceil(halfLength*2/1.25);
 const sin=Math.sin(pose.yaw||0),cos=Math.cos(pose.yaw||0);let floor=-Infinity;
 for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const x=-halfWidth+2*halfWidth*column/columns,z=-halfLength+2*halfLength*row/rows;
  const y=sampleFloor(pose.x+x*cos+z*sin,pose.z+z*cos-x*sin);
  if(!Number.isFinite(y))return Infinity;
  floor=Math.max(floor,y);
 }
 return Math.max(lowerLimit,floor+Math.max(minimumClearance,clearance.below));
}

export function resolveSubmarineTerrainMotion(previous,proposed,sampleFloor,options={}){
 const distance=Math.hypot(proposed.x-previous.x,proposed.z-previous.z);
 const turn=Math.atan2(Math.sin(proposed.yaw-previous.yaw),Math.cos(proposed.yaw-previous.yaw));
 // Runtime displacement is bounded by the simulation clock. Reject an
 // unbounded traversal rather than skip collision samples or consume a frame.
 const steps=Math.max(1,Math.ceil(distance/.5),Math.ceil(Math.abs(turn)/.06));
 if(steps>32)return {pose:{...previous},blocked:true};
 const oldLimit=submarineFloorLimit(previous,sampleFloor,options);
 const oldPenetration=Math.max(0,oldLimit-previous.y);
 let result={...previous};
 for(let i=1;i<=steps;i++){
  const fraction=i/steps;
  const p={x:previous.x+(proposed.x-previous.x)*fraction,z:previous.z+(proposed.z-previous.z)*fraction,
   y:previous.y+(proposed.y-previous.y)*fraction,yaw:previous.yaw+turn*fraction,
   pitch:previous.pitch+(proposed.pitch-previous.pitch)*fraction,roll:previous.roll+(proposed.roll-previous.roll)*fraction};
  const limit=submarineFloorLimit(p,sampleFloor,options);
  // A previously clear hull may settle onto the bed during a descent, but
  // driving into a slope may not raise it above its previous altitude.
  if(limit>Math.max(previous.y,p.y)+1e-6&&Math.max(0,limit-p.y)>=oldPenetration-1e-6){
   const vertical={...previous,y:Math.max(previous.y,proposed.y)};
   return {pose:vertical,blocked:true};
  }
  if(oldPenetration===0)p.y=Math.max(p.y,limit);
  result=p;
 }
 return {pose:result,blocked:false};
}
