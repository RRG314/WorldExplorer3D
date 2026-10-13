// Both existing marine panels present the same Journal-owned chapter.
export function createCoastalDepartureControls({api,prefix='coastal'}){
 const node=document.createElement('details');node.id=`${prefix}Chapter`;
 const summary=document.createElement('summary'),instruction=document.createElement('p'),message=document.createElement('div'),choices=document.createElement('select'),conditions=document.createElement('p'),button=document.createElement('button');
 choices.setAttribute('aria-label','Coastal survey station');choices.id=`${prefix}Site`;button.type='button';button.id=`${prefix}Action`;message.setAttribute('role','status');
 const evidence=document.createElement('details'),evidenceTitle=document.createElement('summary');evidenceTitle.textContent='Conditions & station details';evidence.append(evidenceTitle,conditions);
 node.append(summary,instruction,choices,evidence,button,message);let action=null,lastPhase=null,choiceSignature='';
 choices.onchange=()=>{api()?.select(choices.value);choices.blur();};button.onclick=()=>{button.blur();void api()?.act(action);};
 const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
 return {node,render(s){
  node.hidden=!s?.visible;if(!s?.visible)return;
  text(summary,s.completed?'Coastal Departure · complete':s.plan?'Coastal Departure · in progress':'Coastal Departure · guided voyage');
  if(s.phase!==lastPhase){if(s.phase==='complete')node.open=false;else if(s.plan)node.open=true;lastPhase=s.phase;}
  text(instruction,s.instruction);const sessionNotice=s.storage==='session'&&!!s.plan;
  text(message,s.failure?s.message:sessionNotice?'Session only · export your Journal before leaving.':'');message.hidden=!s.failure&&!sessionNotice;action=s.action;button.hidden=!action||(s.phase==='launch'&&prefix==='coastalDeck');evidence.hidden=!['available','station','complete'].includes(s.phase);
  // The deployment control already sits above this chapter on deck. Keep its
  // subsequent underwater confirmation out of the walking view.
  if(s.phase==='launch'&&prefix==='coastalDeck'){evidence.hidden=true;}
 button.disabled=s.busy||!s.allowed;text(button,s.busy?'Saving or checking…':s.label);
  choices.hidden=s.phase!=='available'||!s.choices;choices.disabled=s.busy;
  const signature=JSON.stringify(s.choices?.map(site=>[site.id,site.allowed]));
  if(signature!==choiceSignature){choiceSignature=signature;choices.replaceChildren();for(const site of s.choices||[]){const option=document.createElement('option');option.value=site.id;option.disabled=!site.allowed;option.textContent=`${site.name}${site.allowed?'':' · depth unavailable'}`;choices.append(option);}}
  choices.value=s.selected;const selection=s.choices?.find(site=>site.id===s.selected);
  text(conditions,`${s.conditions}${selection?` ${selection.detail} ${selection.allowed?`${selection.depth.dataset||'GEBCO'} model depth ${Math.round(selection.depth.depthMeters)} m · ${selection.depth.fetchedAt||'sample time unavailable'}${selection.depth.bundled?' · bundled chart':''}. Simulated water depths differ.`:'Depth could not be verified.'}`:''}`);
 }};
}
