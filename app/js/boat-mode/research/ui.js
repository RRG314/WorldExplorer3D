import {createResearchShipMap} from './map-ui.js';
import {createInvestigationControls} from '../../campaign/coastal-investigation-ui.js';
import {RCRV_LAYOUT} from './layout.js';
import {styleMarinePanel,setMarineText} from '../../ocean/interface.js';
import {createCoastalDepartureControls} from '../../campaign/coastal-departure-ui.js';
export function createResearchDeckHud({enter,helm,moor,act,select,mapChanged,retry,researchAct,sharedAct,coastalApi,investigationApi}) {
 const panel=document.createElement('section');panel.id='researchDeckControls';panel.setAttribute('aria-label','Research ship');
 styleMarinePanel(panel,'deck');
 const map=createResearchShipMap({select,onOpen:mapChanged});
 const title=document.createElement('strong');title.textContent='Research vessel';
 const message=document.createElement('div'),result=document.createElement('div');result.setAttribute('role','status');result.style.marginTop='6px';
 const choice=document.createElement('select');choice.setAttribute('aria-label','Deck destination');choice.style.cssText='width:100%;min-height:38px;margin:6px 0;background:#173d4c;color:white';
 for(const station of RCRV_LAYOUT.stations){const option=document.createElement('option');option.value=station.id;option.textContent=station.label;choice.append(option)}choice.value='lab';choice.onchange=()=>{select(choice.value);result.textContent='';choice.blur()};
 const make=(id,handler)=>{const button=document.createElement('button');button.id=id;button.type='button';button.style.cssText='width:100%;min-height:42px;margin-top:5px;background:#175069;color:white;border:1px solid #91c2d0;border-radius:7px;font:inherit';button.onclick=()=>{button.blur();handler()};return button};
 const sharedButton=make('researchSharedCrew',()=>sharedAct?.());sharedButton.textContent='Shared crew';
 const enterButton=make('researchDeckEnter',enter),helmButton=make('researchDeckHelm',helm),moorButton=make('researchDeckMoor',moor),actionButton=make('researchDeckAction',act);
 const retryButton=make('researchVesselRetry',()=>retry?.());retryButton.textContent='Retry vessel loading';retryButton.hidden=true;
 const researchButton=make('marineResearchLab',()=>researchAct?.()),researchInfo=document.createElement('div');researchInfo.style.cssText='margin-top:8px;border-top:1px solid #50879c;padding-top:7px';
 const reportDetails=document.createElement('details');reportDetails.id='marineResearchReport';reportDetails.style.cssText='margin-top:8px;border-top:1px solid #50879c;padding-top:6px';const reportSummary=document.createElement('summary');reportSummary.textContent='Saved survey report';const reportBody=document.createElement('div');reportDetails.append(reportSummary,reportBody);let reportSignature='';
 enterButton.textContent='Explore research vessel';helmButton.textContent='Find the bridge';
 const mapButton=make('researchShipMapButton',()=>map.open());mapButton.textContent='Map';mapButton.setAttribute('aria-label','Ship map');
 const header=document.createElement('div');header.className='marine-panel-header';header.append(title,mapButton);
 const provisions=document.createElement('div');provisions.hidden=true;provisions.setAttribute('aria-label','Carried galley provisions');
 const legacy=document.createElement('details'),legacyTitle=document.createElement('summary');legacyTitle.textContent='Optional reef mapping · Scanner II';legacy.append(legacyTitle);let investigating=null;
 const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Vessel options';more.append(summary,helmButton,reportDetails,sharedButton,legacy);
 const investigation=createInvestigationControls({api:investigationApi,prefix:'coastalDeck'});
 const coastal=createCoastalDepartureControls({api:coastalApi,prefix:'coastalDeck'});
 panel.append(header,message,choice,actionButton,enterButton,retryButton,moorButton,coastal.node,investigation.node,researchInfo,researchButton,result,provisions,more);
 for(const control of panel.querySelectorAll('button,select'))control.removeAttribute('style');document.body.append(panel);
 return {closeMap:()=>map.close(),hide:()=>{panel.hidden=true;map.close()},dispose:()=>{map.dispose();panel.remove()},
 provisions(items,consume){provisions.replaceChildren();provisions.hidden=false;
 const note=document.createElement('p');note.textContent=items.length?'Choose food or water from your Backpack.':'No food or water in your Backpack. Carry route snacks or trail water from an Earth store for your next voyage.';provisions.append(note);
 for(const item of items){const b=document.createElement('button');b.type='button';b.textContent=`${item.label} · ${item.quantity}`;b.onclick=()=>{consume(item.instanceId);provisions.hidden=true;};provisions.append(b);}
 },message:text=>{result.textContent=text},show:s=>{
  retryButton.hidden=!s.failed;mapButton.hidden=!s.active;map.update(s);if(!s.active||s.target?.id!=='galley'||s.distance>2.4)provisions.hidden=true;
  if(choice.value!==s.target?.id)choice.value=s.target?.id||'lab';
  for(const option of choice.options){const station=s.stations?.find(station=>station.id===option.value);if(station)setMarineText(option,station.label);}
  const research=s.research;researchInfo.hidden=!research?.visible;researchButton.hidden=!research?.visible||!s.active||s.target?.id!=='lab';researchInfo.textContent=research?.visible?`${research.instruction} ${research.message}`:'';researchButton.textContent=research?.labLabel||'Reef survey';researchButton.disabled=!research?.atLab||research?.busy;
  coastal.render(research?.coastal);investigation.render(research?.investigation);
  const nextInvestigating=!!research?.investigation?.started;
  if(investigating!==nextInvestigating){investigating=nextInvestigating;if(investigating)legacy.append(researchInfo,researchButton);else{panel.insertBefore(researchInfo,result);panel.insertBefore(researchButton,result);}}
  legacy.hidden=!investigating;if(investigating)coastal.node.hidden=true;
  const guiding=research?.coastal?.visible&&!research.coastal.completed&&(!!research.coastal.plan||coastal.node.open);
  if(guiding){researchInfo.hidden=true;if(research.coastal.phase!=='station')researchButton.hidden=true;}
  reportDetails.hidden=!research?.visible||!research?.completed;
  const signature=(research?.report||[]).map(e=>e.eventId).join('|');
  if(signature!==reportSignature){reportSignature=signature;reportBody.replaceChildren();for(const event of research?.report||[]){const item=document.createElement('p'),title=document.createElement('strong'),detail=document.createElement('div');title.textContent=event.name;detail.textContent=event.detail;item.append(title,detail);reportBody.append(item);}}
  panel.hidden=false;panel.dataset.active=String(s.active);choice.hidden=actionButton.hidden=helmButton.hidden=!s.active;enterButton.hidden=s.active;
  enterButton.disabled=!s.canEnter;moorButton.hidden=s.active;moorButton.textContent=s.moored?'Release mooring':'Moor vessel';
  setMarineText(message,s.failed?'The vessel could not load. Retry or use Travel; your saved voyage is kept.':s.active?`${s.room.label} · ${s.deck.label}.${s.distance<=2.4?'':s.route?.length?` Follow the passage ${s.direction} to ${s.target.label}`:` Use Ship map to find ${s.target.label}`}${s.target.id==='dive'&&s.distance<=2.4?' Space to enter water.':''}`:s.canEnter?(s.moored?'Moored · Explore the vessel or release mooring to sail.':'Stop, moor and explore the vessel.'):s.reason);
  setMarineText(actionButton,s.target?.action||'');actionButton.disabled=!s.active||s.distance>2.4||s.busy;
 }};
}
