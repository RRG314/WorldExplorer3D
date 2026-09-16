// Compatibility entry: RDT owns procedural identity and its bounded caches.
// All callers share the same seed; no parallel random implementation.
import {ctx as appCtx} from './shared-context.js?v=55';
export {hashGeoToInt, rand01FromInt, seededRandom, rdtSeed as worldSeed} from './rdt.js';
import './rdt.js';
Object.defineProperty(appCtx,'worldSeed',{
  configurable:true, enumerable:true,
  get:()=>appCtx.rdtSeed,
  set:value=>{appCtx.rdtSeed=value;}
});
