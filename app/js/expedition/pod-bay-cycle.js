// Local presentation interlock. Route authority commits only after this cycle releases.
export const POD_BAY_STAGES = Object.freeze([
  {id:'boarding',label:'Boarding Pathfinder · cabin sealed',duration:1.5},
  {id:'sealing',label:'Sealing bay pressure door',duration:1.5},
  {id:'depressurizing',label:'Recovering bay atmosphere',duration:2},
  {id:'opening',label:'Opening launch door',duration:2},
  {id:'releasing',label:'Releasing magnetic clamps',duration:1}
]);
export function podBayCycle(elapsed) {
 let time=Math.max(0,Number(elapsed)||0);
 for(const stage of POD_BAY_STAGES){
  if(time<stage.duration)return {...stage,progress:time/stage.duration,doorFraction:stage.id==='opening'?time/stage.duration:stage.id==='releasing'?1:0,complete:false};
  time-=stage.duration;
 }
 return {id:'released',label:'Pathfinder released',progress:1,doorFraction:1,complete:true};
}
