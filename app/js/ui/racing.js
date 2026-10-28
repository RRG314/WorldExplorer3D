import {ctx} from '../shared-context.js?v=55';
// The geographic graph, models and racing runtime are loaded only when requested.
let implementation=null,pending=null,generation=0;
export function bindRacingUI(options={}) {
 const open=async()=>{
  const run=++generation;
  try {
   pending ||= import('../racing/runtime.js').then(module=>implementation=module.createRacingRuntime(ctx,options)).catch(error=>{pending=null;throw error;});
   await pending;if(run!==generation)return false;await implementation.open();return run===generation;
  } catch(error){ctx.showToast?.('Racing could not open. Please try again.');console.error('[racing] open failed',error);}
 };
 document.getElementById('fRacing')?.addEventListener('click',()=>void (ctx.getGameplayRegistrySnapshot?.().activeId==='racing'?open():ctx.startGameplayPlugin('racing')));
 ctx.registerGameplayPlugin({id:'racing',label:'Road racing',category:'road-game',start:open,
  stop:(_context,_state,reason)=>{generation++;implementation?.stop(reason);},update:dt=>implementation?.update(dt),save:()=>implementation?.snapshot()||null});
 return {open};
}
