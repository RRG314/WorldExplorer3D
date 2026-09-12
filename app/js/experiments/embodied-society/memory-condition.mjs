// A declared observation condition, never an action policy.
export const MEMORY_CONDITIONS=Object.freeze(['outcomes-only','intent-and-outcomes']);
export function memoryCondition(value='outcomes-only') {
 if(!MEMORY_CONDITIONS.includes(value))throw Error('Unknown resident memory condition.');
 return value;
}
export function observedMemory(entries,condition='outcomes-only') {
 memoryCondition(condition);
 return (Array.isArray(entries)?entries:[]).slice(-20).map(entry=>{
  const {decisionSummary,...outcome}=structuredClone(entry);
  return condition==='intent-and-outcomes'&&typeof decisionSummary==='string'
   ?{...outcome,decisionSummary:decisionSummary.slice(0,240)}:outcome;
 });
}
