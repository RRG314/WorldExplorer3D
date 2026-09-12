// Reporting reads recorded state. It never supplies actions to the resident.
export function inventoryTotals(items=[]) {
 const totals={};
 for(const item of items){const id=item.catalogId??item.materialId??'unknown';const quantity=item.quantity??1;if(Number.isFinite(quantity))totals[id]=(totals[id]??0)+quantity;}
 return totals;
}
export const itemLabel=id=>id.replace(/^research:/,'').replaceAll('-',' ');
const safe=value=>String(value??'not recorded').replace(/[\r\n]+/g,' ').replace(/([`*_[\]<>])/g,'\\$1');
const inventory=items=>Object.entries(inventoryTotals(items)).map(([id,n])=>`${safe(itemLabel(id))}: ${n}`).join(', ')||'empty';
export function decisionReport(record) {
 const lines=['# Resident decision report','',`Run: ${safe(record.runId)} · Resident: ${safe(record.actorId)} · Status: ${safe(record.status)}`,'',
 'This report separates model-stated intent from recorded world effects. Summaries are brief model outputs, not access to internal reasoning. Earlier runs did not record them. A selected action is not necessarily a successful action.',''];
 for(const event of record.actionEvidence??[]){
  const before=event.before??{},after=event.after;
  lines.push(`## Decision ${event.decision}: ${safe(event.action?.kind)}`,'',`Stated intent: ${safe(event.decisionSummary??'Not recorded for this decision.')}`,'',
   `Before: simulation tick ${before.tick??'unknown'}; inventory ${inventory(before.inventory)}.`,
   `Needs before: ${Object.entries(before.needs??{}).map(([k,v])=>`${safe(k)} ${Number(v).toFixed(3)}`).join(', ')||'not recorded'}.`,
   `Selected action: ${safe(JSON.stringify(event.action))}`,`Recorded outcome: ${safe(event.status)}${event.reason?` (${safe(event.reason)})`:''}.`);
  if(after){
   lines.push(`After: simulation tick ${after.tick}; inventory ${inventory(after.inventory)}.`);
   const b=inventoryTotals(before.inventory),a=inventoryTotals(after.inventory);
   const changes=[...new Set([...Object.keys(b),...Object.keys(a)])].map(id=>[id,(a[id]??0)-(b[id]??0)]).filter(([,n])=>n);
   lines.push(`Inventory change: ${changes.map(([id,n])=>`${safe(itemLabel(id))} ${n>0?'+':''}${n}`).join(', ')||'none'}.`,
    `Needs after: ${Object.entries(after.needs??{}).map(([k,v])=>`${safe(k)} ${Number(v).toFixed(3)}`).join(', ')||'not recorded'}.`);
  }else lines.push('After-state not recorded; success cannot be established.');
  if(event.pathMeters)lines.push(`Recorded horizontal path: ${event.pathMeters.toFixed(3)} metres.`);
  lines.push('');
 }
 if(!record.actionEvidence?.length)lines.push('No world-action evidence recorded yet.');
 lines.push('## Interpretation limits','','Inventory belongs to this research resident, separately from the human player’s backpack. Movement and crafting must be assessed from completed state transitions. The report does not infer motives from stockpiling, refusal or failure. Full private pre-dispatch observations, when available, remain in the local run archive.');
 return lines.join('\n')+'\n';
}
