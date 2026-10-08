import {activityCompletions} from '../activity-discovery/completion.js';
export function createGameResultController(ctx,{document:dom=globalThis.document,completions=activityCompletions}={}){
 let current=null,serial=0;
 const element=id=>dom?.getElementById(id);
 function renderSave(record){
  if(current!==record)return;
  const status=completions.status(record.id).status;
  const message=status==='saved'?'Saved in your Journal.':status==='cache-retry'?'Journal saved. Retry local history.':status==='saving'?'Saving this result to your Journal…':'Journal save failed. Retry before replaying.';
  if(element('resultJournalStatus'))element('resultJournalStatus').textContent=message;
  if(element('resultJournalRetry')){element('resultJournalRetry').hidden=!['retry','cache-retry'].includes(status);element('resultJournalRetry').onclick=()=>retry();}
  if(element('againBtn'))element('againBtn').disabled=status!=='saved';
 }
 async function retry(){const record=current;if(!record)return false;const promise=completions.retry(record.id);renderSave(record);const saved=await promise;renderSave(record);return saved;}
 function show(title,stats,options={}){
  const mode=options.activityId||ctx.getGameplayRegistrySnapshot?.().activeId||ctx.gameMode||'game';
  const record={id:`game-${mode}-${options.outcome==='failed'?'attempt':'completion'}`,serial:++serial,replay:options.replay||(()=>ctx.startMode?.())};current=record;
  element('resultTitle').textContent=title;element('resultStats').textContent=stats;element('resultScreen').classList.add('show');ctx.setPauseReason?.('game_result',true);
  const pose=ctx.activeEarthActorPosition?.()||ctx.Walk?.state?.walker||ctx.car||{};
  const saving=completions.complete({id:record.id,title},options.durationMs??Math.max(0,ctx.gameTimer||0)*1000,{x:pose.x||0,y:pose.y||0,z:pose.z||0},{outcome:options.outcome||'completed',detail:stats,pointsFirst:0,metadata:{resultOwner:'game-result'}});
  renderSave(record);void saving.then(()=>renderSave(record));return saving;
 }
 function hide(){element('resultScreen')?.classList.remove('show');ctx.setPauseReason?.('game_result',false);}
 function replay(){if(!current||completions.status(current.id).status!=='saved')return false;const action=current.replay;hide();return action();}
 return {show,hide,replay,retry,snapshot:()=>current?{id:current.id,...completions.status(current.id)}:null};
}
