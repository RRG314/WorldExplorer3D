import {memoryCondition as validateMemoryCondition,observedMemory} from './memory-condition.mjs';
import {evidenceSnapshot} from './acceptance-profile.mjs';
const clone = value => structuredClone(value);
const verbs = new Set(['gather','craft','finish','cancel','consume','rest','build','store','retrieve']);
const fields = new Set(['kind','targetId','quantity','recipeId','materialId','seconds','placement']);

// Single-resident supervisor. The host supplies authenticated model dispatch,
// filtered perception and durable checkpoint storage. This is never an agent tool.
export function createRunController({actorId,body,workshop,perceive,persistCheckpoint,decide,maxDecisions=0,maxSeconds=900,decisionTimeoutMs=30000,wallDeadlineMs=null,now=()=>Date.now(),memoryCondition='outcomes-only',clockIntervalSeconds=1}) {
  if(typeof now!=='function'||(wallDeadlineMs!==null&&!Number.isFinite(wallDeadlineMs))||!actorId || !body || !workshop || typeof perceive!=='function' || typeof persistCheckpoint!=='function' ||
      !Number.isSafeInteger(maxDecisions) || maxDecisions<0 || maxDecisions>1000 ||
      !Number.isSafeInteger(maxSeconds) || maxSeconds<1 || maxSeconds>28800 ||
      !Number.isSafeInteger(decisionTimeoutMs) || decisionTimeoutMs<1 || decisionTimeoutMs>60000) throw Error('Invalid bounded run configuration.');
  validateMemoryCondition(memoryCondition);
  if(!Number.isSafeInteger(clockIntervalSeconds)||clockIntervalSeconds<1||clockIntervalSeconds>30)throw Error('Invalid needs checkpoint interval.');
  const current=()=>workshop.stateView?.()??workshop.snapshot();
  const flushClock=()=>workshop.advanceTo(Math.floor(frames/60));
  let status='paused',frames=(workshop.snapshot().tick??0)*60,epoch=0,calls=0,serial=0,pending=null,error=null,lastOutcome=null;
  const memory=[],actionEvidence=[];let movingEvidence=null;
  let queue=Promise.resolve();
  const initialTick=frames/60;
  function observation({includePerception=true}={}) {
    const state=current(),actor=state.actors[actorId];
    if(!actor)throw Error('Resident missing from workshop.');
    return clone({actorId,tick:Math.floor(frames/60),body:body.observation(),needs:actor.needs,condition:actor.condition,
      experimentBudget:{maximumDecisions:maxDecisions,decisionAttempts:calls,furtherDecisions:Math.max(0,maxDecisions-calls),simulatedSecondsRemaining:Math.max(0,maxSeconds-(frames/60-initialTick)),wallSecondsRemaining:wallDeadlineMs===null?null:Math.max(0,(wallDeadlineMs-now())/1000)},
      inventory:workshop.inspectInventory(actorId).items,job:actor.job,lastOutcome,memoryCondition,recentMemory:observedMemory(memory,memoryCondition),visible:includePerception?perceive(actorId):null});
  }
  function checkpoint(reason) {
    if(movingEvidence)movingEvidence.after=evidenceSnapshot(body,workshop,actorId);
    return persistCheckpoint(clone({schemaVersion:1,runId:workshop.snapshot().runId,actorId,status,frames,calls,serial,reason,
      workshop:workshop.snapshot(),body:body.checkpoint(),error,lastOutcome,memoryCondition,clockIntervalSeconds,maxSeconds,memory,actionEvidence}));
  }
  function settleMovement(){if(movingEvidence){movingEvidence.status='movement-interrupted';movingEvidence.after=evidenceSnapshot(body,workshop,actorId);movingEvidence=null;}}
  function fail(cause) {settleMovement();status='failed';error=String(cause?.message||cause);epoch++;pending?.abort();body.pause();}
  function serialized(fn) {
    const result=queue.then(fn);queue=result.catch(()=>{});return result;
  }
  body.pause();
  async function applyAction(action,token,decisionSummary=null) {
    if(status!=='running'||token!==epoch)return {cancelled:true};
    if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Invalid resident action.');
    if(actionEvidence.length>=maxDecisions)throw Error('Action evidence allowance exhausted.');
    const evidence={decision:calls,decisionSummary,action:clone(action),before:evidenceSnapshot(body,workshop,actorId),status:'proposed',after:null,pathMeters:0};
    actionEvidence.push(evidence);
    if(action.kind==='move') {
      if(Object.keys(action).some(k=>!['kind','move','strafe','turn','lookYaw','lookPitch','frames'].includes(k)))throw Error('Unsupported movement field.');
      const {kind,...axes}=action;body.command(axes);
    } else if(action.kind==='wait') {
      if(Object.keys(action).some(k=>k!=='kind') )throw Error('Unsupported wait field.');
      body.command({frames:1});
    } else {
      if(!verbs.has(action.kind)||Object.keys(action).some(k=>!fields.has(k)))throw Error('Unsupported resident action.');
      try {
        await workshop.execute(actorId,{...action,operationId:`supervisor-${++serial}`,expectedRevision:workshop.snapshot().revision},Math.floor(frames/60));
      } catch(cause) {
        const ordinary=new Set(['not-consumable','unknown-process','insufficient-material','resource-unavailable','tool-required','station-required','work-not-complete','world-permission-denied','resource-not-in-reach','carrying-capacity','occupied-cell','actor-busy','verified-shelter-required','rest-interrupted','no-active-work']);
        if(!ordinary.has(cause.code))throw cause;
        evidence.status='rejected';evidence.reason=cause.code;evidence.after=evidenceSnapshot(body,workshop,actorId);
        lastOutcome={action:clone(action),status:'rejected',reason:cause.code,tick:Math.floor(frames/60)};
        memory.push({...clone(lastOutcome),decisionSummary,position:body.observation().position});if(memory.length>20)memory.shift();
        await checkpoint('action-rejected');return clone(lastOutcome);
      }
    }
    evidence.status=action.kind==='move'?'movement-queued':'applied';evidence.after=evidenceSnapshot(body,workshop,actorId);
    if(action.kind==='move')movingEvidence=evidence;
    lastOutcome={action:clone(action),status:'accepted',tick:Math.floor(frames/60)};
    memory.push({...clone(lastOutcome),decisionSummary,position:body.observation().position});if(memory.length>20)memory.shift();
    await checkpoint('action');return {accepted:true};
  }
  return Object.freeze({
    observation,
    report:()=>clone({schemaVersion:1,runId:workshop.snapshot().runId,actorId,status,frames,calls,memoryCondition,actionEvidence}),
    state:()=>({status,frames,calls,maxDecisions,pending:!!pending,error}),
    resume(){return serialized(async()=>{
      if(status!=='paused')throw Error('Only a paused run can resume.');
      status='running';body.resume();try{await checkpoint('resume');}catch(e){fail(e);throw e;}
    });},
    pause(){
      if(status==='ended'||status==='failed')return Promise.resolve();
      settleMovement();status='paused';epoch++;pending?.abort();body.pause();
      return serialized(async()=>{try{await flushClock();await checkpoint('pause');}catch(e){fail(e);throw e;}});
    },
    step(count=1){return serialized(async()=>{
      if(status!=='running')return;
      if(!Number.isInteger(count)||count<1||count>60)throw Error('Step must be 1–60 physics frames.');
      try {
        for(let n=0;n<count&&status==='running';n++) {
          if(frames/60-initialTick>=maxSeconds){settleMovement();status='ended';body.pause();break;}
          if(current().actors[actorId].condition<=0){settleMovement();status='ended';body.pause();break;}
          const beforePosition=movingEvidence?body.observation().position:null;
          body.step();frames++;
          if(movingEvidence){const afterPosition=body.observation().position;
            movingEvidence.pathMeters+=Math.hypot(afterPosition.x-beforePosition.x,afterPosition.z-beforePosition.z)*(body.metersPerWorldUnit??1);
            if(body.observation().remainingFrames===0){movingEvidence.after=evidenceSnapshot(body,workshop,actorId);movingEvidence.status='movement-completed';movingEvidence=null;}
          }
          if(frames%(60*clockIntervalSeconds)===0)await flushClock();
        }
        if(status!=='running')await flushClock();
        if(frames%(60*clockIntervalSeconds)===0||status!=='running')await checkpoint('step');
      }catch(e){fail(e);throw e;}
    });},
    decide(){
      if(status!=='running'||pending)return Promise.reject(Error('Run is paused or a decision is already pending.'));
      if(typeof decide!=='function'||calls>=maxDecisions)return Promise.reject(Error('No model decision allowance remains.'));
      const abort=new AbortController(),token=epoch;pending=abort;
      return serialized(async()=>{
        let timer;
        try {
          if(status!=='running'||token!==epoch)return {cancelled:true};
          await flushClock();calls++;await checkpoint('decision-reserved');
          const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Decision timed out.'));},decisionTimeoutMs);});
          const cancelled=new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(Error('Decision cancelled.')),{once:true}));
          if(abort.signal.aborted)return {cancelled:true};
          const action=await Promise.race([decide(observation(),{signal:abort.signal}),timeout,cancelled]);
          return await applyAction(action?.action??action,token,typeof action?.decisionSummary==='string'?action.decisionSummary.slice(0,240):null);
        }catch(e){
          if(token!==epoch)return {cancelled:true};
          fail(e);throw e;
        }finally{clearTimeout(timer);if(pending===abort)pending=null;}
      });
    },
    abort(reason){fail(reason);return serialized(()=>checkpoint('host-failed'));},
    end(){if(status==='failed')return serialized(()=>checkpoint('failed-end'));settleMovement();status='ended';epoch++;pending?.abort();body.pause();return serialized(async()=>{try{await flushClock();return await checkpoint('end');}catch(e){fail(e);throw e;}});}
  });
}
