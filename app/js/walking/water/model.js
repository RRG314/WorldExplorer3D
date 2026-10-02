export const SWIM_POLICY=Object.freeze({entryDepth:1.45,exitDepth:1.4,airSeconds:180,lowAirSeconds:20,maximumDiveMeters:18,swimSpeedMps:1.8,boostSpeedMps:2.5,verticalSpeedMps:1.2});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function classifyWaterTraversal({surfaceY,bottomY,eyeY,eyeHeight=1.7,wasSwimming=false,baseY=surfaceY}) {
 if (![surfaceY,bottomY,eyeY].every(Number.isFinite))return 'dry';
 const depth=(Number.isFinite(baseY)?baseY:surfaceY)-bottomY,feet=eyeY-eyeHeight;
 if(depth<=(wasSwimming?SWIM_POLICY.exitDepth:SWIM_POLICY.entryDepth)||feet>=surfaceY-.45)return feet<surfaceY&&depth>0?'wading':'dry';
 return 'swimming';
}
export function createSwimState(saved={}) {
 return {equipment:saved.equipment==='scuba'?'scuba':'none',airSeconds:clamp(Number.isFinite(saved.airSeconds)?saved.airSeconds:SWIM_POLICY.airSeconds,0,SWIM_POLICY.airSeconds),stamina:clamp(Number.isFinite(saved.stamina)?saved.stamina:1,0,1),verticalVelocity:0,elapsed:0};
}
export function stepSwimming(state,{eyeY,surfaceY,bottomY,dt,vertical=0,moving=false,boost=false,metersPerUnit=1}) {
 const step=clamp(Number(dt)||0,0,.1),units=metersPerUnit>0?metersPerUnit:1;
 const next={...state,elapsed:state.elapsed+step};
 const submerged=eyeY<surfaceY-.22;
 const deepEnough=(surfaceY-bottomY)*units>2.5;
 if(deepEnough&&(vertical<-.05||submerged))next.equipment='scuba';
 if(submerged&&next.equipment==='scuba')next.airSeconds=Math.max(0,next.airSeconds-step);
 const recovering=next.equipment==='scuba'&&next.airSeconds<=SWIM_POLICY.lowAirSeconds;
 next.stamina=clamp(next.stamina+(moving&&boost?-.08:.1)*step,0,1);
 const boosted=boost&&next.stamina>.05;
 const targetSurface=surfaceY+.18;
 const wantsDive=next.equipment==='scuba'&&deepEnough&&!recovering;
 const control=recovering?1:wantsDive?clamp(vertical,-1,1):Math.max(0,vertical);
 const targetV=control!==0?control*SWIM_POLICY.verticalSpeedMps/units
   :submerged&&wantsDive?0:clamp((targetSurface-eyeY)*3,-1.8,1.8);
 next.verticalVelocity+=(targetV-next.verticalVelocity)*(1-Math.exp(-step*6));
 let y=eyeY+next.verticalVelocity*step;
 const floor=Math.max(bottomY+1.65,surfaceY-SWIM_POLICY.maximumDiveMeters/units);
 y=clamp(y,Math.min(floor,targetSurface),targetSurface);
 if(y===targetSurface||y===floor)next.verticalVelocity=0;
 return {state:next,y,submerged:y<surfaceY-.22,recovering,speed:(boosted?SWIM_POLICY.boostSpeedMps:SWIM_POLICY.swimSpeedMps)/units};
}
