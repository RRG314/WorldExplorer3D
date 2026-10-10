// Shared content inside the existing deck, submarine and diver panels.
export function createInvestigationControls({api,prefix}){
 const node=document.createElement('details');node.id=`${prefix}Investigation`;
 const title=document.createElement('summary'),instruction=document.createElement('p'),guidance=document.createElement('p'),message=document.createElement('div'),choice=document.createElement('select'),conclusion=document.createElement('select'),button=document.createElement('button');
 choice.id=`${prefix}Contact`;choice.setAttribute('aria-label','Investigation contact');conclusion.id=`${prefix}Conclusion`;conclusion.setAttribute('aria-label','Coastal report conclusion');button.id=`${prefix}Investigate`;button.type='button';message.setAttribute('role','status');
 const evidence=document.createElement('details'),evidenceTitle=document.createElement('summary'),evidenceBody=document.createElement('div');evidenceTitle.textContent='Compare saved evidence';evidence.append(evidenceTitle,evidenceBody);
 node.append(title,instruction,guidance,choice,evidence,conclusion,button,message);
 let action=null,lastPhase=null,options='',lines='',conclusions='';
 const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 choice.onchange=()=>{api()?.select(choice.value);choice.blur();};conclusion.onchange=()=>{api()?.conclude(conclusion.value);conclusion.blur();};button.onclick=()=>{button.blur();void api()?.act(action);};
 return {node,render(s){
  node.hidden=!s?.visible;if(!s?.visible)return;
  text(title,s.completed?'Coastal Explorer · complete':s.diver?'What the Coast Revealed':s.selected&&s.chart?'Outside the Hull':'Read the Seabed');
  if(s.phase!==lastPhase){node.open=s.started&&!s.completed&&!(prefix==='coastalDiver'&&s.phase==='return');lastPhase=s.phase;}
  text(instruction,s.instruction);text(guidance,s.guidance);guidance.hidden=!s.guidance;
  action=s.action;text(button,s.busy?'Saving…':s.label);button.hidden=!action;button.disabled=s.busy||!s.allowed;
  choice.hidden=!s.canChoose;choice.disabled=s.busy;
  const signature=JSON.stringify(s.choices);if(options!==signature){options=signature;choice.replaceChildren();for(const c of s.choices){const o=document.createElement('option');o.value=c.id;o.textContent=c.label;o.disabled=!c.allowed;choice.append(o);}}choice.value=s.selected;
  conclusion.hidden=!s.canConclude;conclusion.disabled=s.busy;
  if(conclusions!==JSON.stringify(s.conclusions)){conclusions=JSON.stringify(s.conclusions);conclusion.replaceChildren();for(const [id,label] of Object.entries(s.conclusions)){const o=document.createElement('option');o.value=id;o.textContent=label;conclusion.append(o);}}conclusion.value=s.conclusion;
  const next=JSON.stringify(s.evidence);if(lines!==next){lines=next;evidenceBody.replaceChildren();for(const detail of s.evidence){const p=document.createElement('p');p.textContent=detail;evidenceBody.append(p);}}
  evidence.hidden=!s.evidence.length;text(message,s.failure?s.message:s.storage==='session'&&s.started?'Session only · export your Journal before leaving.':'');message.hidden=!message.textContent;
 }};
}
