import { initialNeeds, advanceNeeds, applyConsumption, NEED_RULES } from './needs.mjs';
import { createBackpackModel } from '../../player/backpack-model.js?v=4';
import { BLOCK_SHAPES, blockDocumentIdFromCoords } from '../../block-builder/catalog.js?v=2';
import { MATERIALS, RECIPES, MATERIAL_RULESET } from './material-rules.mjs';

const definitions = new Map(MATERIALS.map(m=>[m.id,m]));
const clone = value => structuredClone(value);
const fail = (code, message=code) => { throw Object.assign(new Error(message),{code}); };
const key = value => typeof value==='string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item);
const backpack = state => createBackpackModel({...state,definitions:MATERIALS});
const count = (bag,id) => bag.snapshot().items.filter(i=>i.catalogId===id).reduce((sum,i)=>sum+i.quantity,0);
function take(bag,id,quantity) {
  if (!Number.isSafeInteger(quantity) || quantity<=0 || count(bag,id)<quantity) fail('insufficient-material');
  for (const item of bag.snapshot().items.filter(i=>i.catalogId===id)) {
    const amount=Math.min(quantity,item.quantity);bag.consume(item.instanceId,amount,{silent:true});quantity-=amount;if(!quantity)break;
  }
}
function give(bag,id,quantity,eventId) {
  if(!definitions.has(id)||!Number.isSafeInteger(quantity)||quantity<=0)fail('invalid-material');
  if(definitions.get(id).capabilities.length) {
    for(let n=0;n<quantity;n++)bag.upsertItem({instanceId:`${eventId}:${id}:${n}`,catalogId:id,quantity:1,condition:1,authority:'research',provenance:eventId},{silent:true});
    return;
  }
  const old=bag.item(id);
  bag.upsertItem({instanceId:old?.instanceId||`material:${id}`,catalogId:id,quantity:(old?.quantity||0)+quantity,authority:'research',provenance:eventId},{silent:true});
}
function moveMaterial(source,destination,id,quantity,eventId) {
  if(!Number.isSafeInteger(quantity)||quantity<=0||count(source,id)<quantity)fail('insufficient-material');
  const selected=source.snapshot().items.filter(i=>i.catalogId===id);
  take(source,id,quantity);
  if(!definitions.get(id)?.capabilities.length){give(destination,id,quantity,eventId);return;}
  // Transfer tool instances intact, including wear; no free repair on transfer.
  for(const item of selected){const n=Math.min(quantity,item.quantity);destination.upsertItem({...item,quantity:n},{silent:true});quantity-=n;if(!quantity)break;}
}
const escrowMass = actor => Object.entries(actor.job?.escrow??{}).reduce((sum,[id,n])=>sum+definitions.get(id).massGrams*n,0);
export function inventoryMassGrams(state) {
  return backpack(state).snapshot().items.reduce((sum,item)=>sum+(definitions.get(item.catalogId)?.massGrams||0)*item.quantity,0);
}
export function createWorkshopState({runId,actorIds,nodes=[]}) {
  if(!key(runId)||!Array.isArray(actorIds)||!actorIds.length||new Set(actorIds).size!==actorIds.length||actorIds.some(id=>!key(id)))fail('invalid-initial-state');
  const resources={};
  for(const node of nodes) {
    if(!key(node.id)||resources[node.id]||!definitions.has(node.materialId)||!Number.isSafeInteger(node.remaining)||node.remaining<0)fail('invalid-resource-node');
    resources[node.id]={...clone(node)};
  }
  return {schemaVersion:1,ruleset:MATERIAL_RULESET,runId,revision:0,tick:0,actors:Object.fromEntries(actorIds.map(id=>[id,{backpack:backpack({}).exportState(),job:null,needs:initialNeeds(),condition:1}])),nodes:resources,structures:{},receipts:{},events:[]};
}

// Operator-owned domain service. Agents receive only an authenticated command
// proxy, never this object or the persistence/authorization callbacks. The world
// adapter must attest proximity, access and station capability from real state.
export function createWorkshopService({initialState,authorize,persist,maxMassGrams=20000,maxEvents=1000}) {
  if(typeof authorize!=='function'||typeof persist!=='function')fail('missing-world-authority');
  if(initialState?.schemaVersion!==1||initialState?.ruleset!==MATERIAL_RULESET)fail('incompatible-workshop-state');
  let state=clone(initialState),queue=Promise.resolve();
  async function apply(actorId,command,tick) {
    if(!key(actorId)||!Object.hasOwn(state.actors,actorId)||!key(command?.operationId)||!Number.isSafeInteger(tick)||tick<0)fail('invalid-command');
    if(command.actorId!==undefined && command.actorId!==actorId)fail('actor-spoof');
    const receiptId=`${actorId}/${command.operationId}`,fingerprint=stable(command);
    const previous=state.receipts[receiptId];
    if(previous) {if(previous.fingerprint!==fingerprint)fail('operation-conflict');return clone(previous.result);}
    if(tick<(state.tick??0)||tick<(state.actors[actorId].needs.lastTick??0))fail('clock-rewind');
    if(command.expectedRevision!==state.revision)fail('stale-revision');
    if(state.events.length>=maxEvents)fail('journal-budget-exhausted');
    const context=await authorize({runId:state.runId,actorId,command:clone(command),tick});
    if(context?.allowed!==true)fail('world-permission-denied');
    const next=clone(state);
    for(const id of Object.keys(next.actors))next.actors[id]=advanceNeeds(next.actors[id],tick);
    const actor=next.actors[actorId],bag=backpack(actor.backpack);
    const output={operationId:command.operationId,kind:command.kind,actorId};
    if(actor.condition<=0 && command.kind!=='cancel')fail('actor-incapacitated');
    if(actor.job && !['finish','cancel'].includes(command.kind))fail('actor-busy');
    if(command.kind==='gather') {
      const node=next.nodes[command.targetId];
      if(!node||context.targetId!==node.id||context.inReach!==true)fail('resource-not-in-reach');
      const quantity=command.quantity;
      if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>node.remaining)fail('resource-unavailable');
      if(quantity>1)fail('gather-batch-too-large');
      if(node.requiredTool) {
        const tool=bag.snapshot().items.find(i=>i.catalogId===node.requiredTool&&(i.condition??1)>=0.1);
        if(!tool)fail('tool-required');
        bag.upsertItem({...tool,condition:Math.max(0,(tool.condition??1)-0.1)},{silent:true});
      }
      node.remaining-=quantity;give(bag,node.materialId,quantity,receiptId);output.materialId=node.materialId;output.quantity=quantity;
    } else if(command.kind==='craft') {
      const recipe=RECIPES.find(r=>r.id===command.recipeId);if(!recipe)fail('unknown-process');
      for(const id of recipe.tools)if(!bag.snapshot().items.some(i=>i.catalogId===id&&(i.condition??1)>0))fail('tool-required');
      if(recipe.station && (context.inReach!==true||!context.stationCapabilities?.includes(recipe.station)))fail('station-required');
      for(const [id,n] of Object.entries(recipe.inputs))if(count(bag,id)<n)fail('insufficient-material');
      for(const [id,n] of Object.entries(recipe.inputs))take(bag,id,n);
      actor.job={recipeId:recipe.id,stationId:context.stationId??null,startedAt:tick,readyAt:tick+recipe.durationTicks,escrow:clone(recipe.inputs),originOperationId:command.operationId};
      output.readyAt=actor.job.readyAt;
    } else if(command.kind==='finish') {
      if(!actor.job||tick<actor.job.readyAt)fail('work-not-complete');
      if(actor.job.kind==='rest') {
        if(context.inReach!==true||context.sheltered!==true||context.restContinuousSince>actor.job.startedAt||!Number.isFinite(context.restContinuousSince))fail('rest-interrupted');
        // Needs were advanced normally above; restore only the verified interval.
        const seconds=actor.job.readyAt-actor.job.startedAt;
        actor.needs.rest=Math.max(0,Math.min(1,actor.job.restBefore+seconds*NEED_RULES.restRecoveryPerSecond)-(tick-actor.job.readyAt)*NEED_RULES.restPerSecond);
        output.restedSeconds=seconds;actor.job=null;
      } else {
      const recipe=RECIPES.find(r=>r.id===actor.job.recipeId);
      if(recipe.station&&(context.inReach!==true||!context.stationCapabilities?.includes(recipe.station)))fail('station-required');
      for(const [id,n]of Object.entries(recipe.outputs))give(bag,id,n,receiptId);
      output.outputs=clone(recipe.outputs);actor.job=null;
      }
    } else if(command.kind==='cancel') {
      if(!actor.job)fail('no-active-work');
      for(const [id,n] of Object.entries(actor.job.escrow))give(bag,id,n,receiptId);
      output.returnedInputs=clone(actor.job.escrow);actor.job=null;
    } else if(command.kind==='consume') {
      const definition=definitions.get(command.materialId);
      if(!definition||!definition.verbs?.includes('consume'))fail('not-consumable');
      take(bag,command.materialId,1);
      const changed=applyConsumption(actor,definition);actor.condition=changed.condition;actor.needs=changed.needs;
      output.consumedMassGrams=definition.massGrams;
    } else if(command.kind==='rest') {
      if(context.inReach!==true||context.sheltered!==true)fail('verified-shelter-required');
      const seconds=command.seconds;
      if(!Number.isSafeInteger(seconds)||seconds<1||seconds>3600)fail('invalid-rest-duration');
      actor.job={kind:'rest',restBefore:actor.needs.rest,startedAt:tick,readyAt:tick+seconds,escrow:{},originOperationId:command.operationId};output.readyAt=actor.job.readyAt;
    } else if(command.kind==='build') {
      const kits={
        'research:workbench-kit':{kind:'workbench',shape:'slab',capabilities:['woodworking']},
        'research:storage-kit':{kind:'storage',shape:'cube',capabilities:['storage']},
        'research:wall-kit':{kind:'wall',shape:'wall',capabilities:[]},
        'research:shelter-kit':{kind:'shelter',shape:'roof',capabilities:[]}
      };
      const type=kits[command.materialId],p=context.placement;
      if(!type||!p||context.inReach!==true||context.placementAllowed!==true||!['gx','gy','gz'].every(k=>Number.isFinite(p[k])))fail('invalid-placement');
      if(!Number.isInteger(p.gx)||!Number.isInteger(p.gz)||!Number.isInteger(p.gy*2)||!BLOCK_SHAPES.some(s=>s.id===type.shape))fail('invalid-placement');
      const cellId=blockDocumentIdFromCoords(p.gx,p.gy,p.gz);
      if(Object.values(next.structures).some(s=>s.cellId===cellId))fail('occupied-cell');
      if(Object.keys(next.structures).length>=200)fail('construction-limit');
      take(bag,command.materialId,1);
      const structureId=`structure:${receiptId}`;
      next.structures[structureId]={id:structureId,cellId,ownerId:actorId,kitId:command.materialId,kind:type.kind,capabilities:type.capabilities,block:{...p,shape:type.shape,rotation:0,materialIndex:7},contents:backpack({}).exportState()};
      output.structureId=structureId;
      // A roof alone is not proof of shelter; occupancy/weather protection must
      // be resolved by real world geometry before any need benefit is granted.
    } else if(command.kind==='store'||command.kind==='retrieve') {
      const structure=next.structures[command.targetId];
      if(!structure||structure.kind!=='storage'||context.targetId!==structure.id||context.inReach!==true||(structure.ownerId!==actorId&&context.storageAccess!==true))fail('storage-not-authorized');
      const stored=backpack(structure.contents);
      const source=command.kind==='store'?bag:stored,destination=command.kind==='store'?stored:bag;
      moveMaterial(source,destination,command.materialId,command.quantity,receiptId);
      structure.contents=stored.exportState();
      if(inventoryMassGrams(structure.contents)>50000)fail('storage-capacity');
    } else if(command.kind==='transfer') {
      if(!Object.hasOwn(state.actors,command.recipientId)||command.recipientId===actorId||context.recipientId!==command.recipientId||context.recipientConsented!==true||context.inReach!==true)fail('transfer-not-authorized');
      const recipient=next.actors[command.recipientId],other=backpack(recipient.backpack);
      moveMaterial(bag,other,command.materialId,command.quantity,receiptId);
      recipient.backpack=other.exportState();if(inventoryMassGrams(recipient.backpack)+escrowMass(recipient)>maxMassGrams)fail('recipient-capacity');
    } else fail('unsupported-action');
    actor.backpack=bag.exportState();actor.lastTick=tick;
    if(inventoryMassGrams(actor.backpack)+escrowMass(actor)>maxMassGrams)fail('carrying-capacity');
    next.tick=tick;next.revision++;output.revision=next.revision;
    next.events.push({eventId:receiptId,runId:state.runId,sequence:next.revision,tick,actorId,kind:command.kind,result:clone(output),ruleset:MATERIAL_RULESET});
    next.receipts[receiptId]={fingerprint,result:clone(output)};
    // Persist one whole transition before publishing it. Failure leaves live state
    // unchanged; retries cannot double-consume materials or bypass escrow.
    await persist(clone(next));state=next;return clone(output);
  }
  return Object.freeze({
    execute(actorId,command,tick){const work=queue.then(()=>apply(actorId,command,tick));queue=work.catch(()=>{});return work;},
    // Supervisor-only clock: needs progress even when no resident acts. The host
    // awaits this durable transition; rejected persistence cannot advance time.
    advanceTo(tick){
      const work=queue.then(async()=>{
        const previous=state.tick??Math.max(...Object.values(state.actors).map(a=>a.needs.lastTick));
        if(!Number.isSafeInteger(tick)||tick<previous)fail('clock-rewind');
        if(tick===previous)return {tick,revision:state.revision};
        if(state.events.length>=maxEvents)fail('journal-budget-exhausted');
        const next=clone(state);
        for(const id of Object.keys(next.actors))next.actors[id]=advanceNeeds(next.actors[id],tick);
        next.tick=tick;next.revision++;
        next.events.push({eventId:`clock:${next.revision}`,runId:next.runId,sequence:next.revision,tick,kind:'clock',ruleset:MATERIAL_RULESET});
        await persist(clone(next));state=next;return {tick,revision:state.revision};
      });queue=work.catch(()=>{});return work;
    },
    stateView(){const {events,receipts,...current}=state;return clone(current);},
    snapshot(){return clone(state);},
    inspectInventory(actorId){if(!Object.hasOwn(state.actors,actorId))fail('unknown-actor');return backpack(state.actors[actorId].backpack).snapshot();}
  });
}
