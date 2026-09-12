import { createPlayerConditionModel } from '../../player/condition-model.js?v=1';
// Explicit game rules: one workshop tick is one simulated second. These rates
// are experimental constraints, not physiological measurements.
export const NEED_RULES = Object.freeze({schemaVersion:1,waterPerSecond:1/14400,foodPerSecond:1/28800,restPerSecond:1/28800,restRecoveryPerSecond:1/7200,deprivationDamagePerSecond:1/72000});
export function initialNeeds(){return {water:1,food:1,rest:1,lastTick:0};}
export function advanceNeeds(actor,tick,{resting=false}={}) {
  if(!Number.isSafeInteger(tick)||tick<actor.needs.lastTick)throw new Error('Invalid need clock.');
  const elapsed=tick-actor.needs.lastTick;
  const before=actor.needs;
  const water=Math.max(0,before.water-elapsed*NEED_RULES.waterPerSecond);
  const food=Math.max(0,before.food-elapsed*NEED_RULES.foodPerSecond);
  // Integrate deprivation only after reserves are exhausted, rather than charge
  // an entire elapsed interval because its endpoint reached zero.
  const deprived=Math.max(0,elapsed-Math.min(before.water/NEED_RULES.waterPerSecond,before.food/NEED_RULES.foodPerSecond));
  const health=createPlayerConditionModel({storage:{getItem:()=>null,setItem:()=>{}},now:()=>tick*1000});
  health.set(actor.condition??1,'research-hydrate',{persist:false});
  health.set(Math.max(0,(actor.condition??1)-deprived*NEED_RULES.deprivationDamagePerSecond),'research-needs',{persist:false});
  return {...actor,condition:health.snapshot().condition,needs:{water,food,rest:Math.max(0,Math.min(1,before.rest+elapsed*(resting?NEED_RULES.restRecoveryPerSecond:-NEED_RULES.restPerSecond))),lastTick:tick}};
}
export function applyConsumption(actor,definition) {
  const health=createPlayerConditionModel({storage:{getItem:()=>null,setItem:()=>{}}});
  health.set(actor.condition??1,'research-hydrate',{persist:false});health.restore(definition.conditionRestore||0,'research-consumption');
  return {...actor,condition:health.snapshot().condition,needs:{...actor.needs,
    water:Math.min(1,actor.needs.water+(definition.needRestore?.water??0)),
    food:Math.min(1,actor.needs.food+(definition.needRestore?.food??0))}};
}
