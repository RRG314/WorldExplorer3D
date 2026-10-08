'use strict';

function normalizePlayerConditionInput(input = {}) {
  const condition = Number(input.condition);
  if (!Number.isFinite(condition) || condition < 0 || condition > 1) throw new Error('invalid_player_condition');
  return Object.freeze({
    authority: 'explorer-player-state-v1',
    schemaVersion: 1,
    condition: Math.round(condition * 10000) / 10000,
    reason: String(input.reason || 'gameplay').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  });
}

function applyPlayerConditionMutation(current,input={}) {
  const normalized=normalizePlayerConditionInput(input);
  const revision=Math.max(0,Number(current?.revision)||0);
  const identity=input.mutationId;
  const receipts=Array.isArray(current?.mutationReceipts)?current.mutationReceipts:[];
  if(identity!==undefined){
    if(typeof identity!=='string'||!/^[a-zA-Z0-9:_-]{8,100}$/.test(identity)||!Number.isInteger(input.expectedRevision)||input.expectedRevision<0)
      throw Object.assign(new Error('Invalid condition command.'),{status:400});
    const fingerprint=JSON.stringify([normalized.condition,normalized.reason,input.expectedRevision]);
    const previous=receipts.find(r=>r.id===identity);
    if(previous){
      if(previous.fingerprint!==fingerprint)throw Object.assign(new Error('Condition command identity was reused.'),{status:400});
      return current;
    }
    if(input.expectedRevision!==revision)throw Object.assign(new Error('Player condition changed. Syncing the latest revision.'),{
      status:409,state:{revision,condition:current?.condition??1}});
    return {...normalized,revision:revision+1,mutationReceipts:[...receipts,{id:identity,fingerprint}].slice(-32)};
  }
  // Older released clients remain compatible. New clients use revision checks.
  return {...normalized,revision:revision+1,mutationReceipts:receipts};
}
module.exports = { normalizePlayerConditionInput, applyPlayerConditionMutation };
