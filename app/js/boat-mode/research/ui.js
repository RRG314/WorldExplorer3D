import {RESEARCH_STATIONS} from './layout.js';
export function createResearchDeckHud({enter,helm,moor,act,select,researchAct}) {
 const panel=document.createElement('section');panel.id='researchDeckControls';panel.setAttribute('aria-label','Research ship');
 panel.style.cssText='position:fixed;right:12px;top:116px;z-index:120;background:#092a3bf2;border:1px solid #50879c;border-radius:10px;padding:10px;width:250px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 220px);overflow:auto;box-sizing:border-box;color:#eefaff;font:13px/1.4 system-ui';
 const style=document.createElement('style');style.textContent='body:has(#researchDeckControls[data-active=true]) #boatPrompt{display:none}@media(max-width:600px){#researchDeckControls{top:276px!important;max-height:calc(100dvh - 375px);overflow:auto}}';document.head.append(style);
 const title=document.createElement('strong');title.textContent='Research vessel';
 const message=document.createElement('div'),result=document.createElement('div');result.setAttribute('role','status');result.style.marginTop='6px';
 const choice=document.createElement('select');choice.setAttribute('aria-label','Deck destination');choice.style.cssText='width:100%;min-height:38px;margin:6px 0;background:#173d4c;color:white';
 for(const station of RESEARCH_STATIONS){const option=document.createElement('option');option.value=station.id;option.textContent=station.label;choice.append(option)}choice.value='lab';choice.onchange=()=>{select(choice.value);result.textContent='';choice.blur()};
 const make=(id,handler)=>{const button=document.createElement('button');button.id=id;button.type='button';button.style.cssText='width:100%;min-height:42px;margin-top:5px;background:#175069;color:white;border:1px solid #91c2d0;border-radius:7px;font:inherit';button.onclick=()=>{button.blur();handler()};return button};
 const enterButton=make('researchDeckEnter',enter),helmButton=make('researchDeckHelm',helm),moorButton=make('researchDeckMoor',moor),actionButton=make('researchDeckAction',act);
 const researchButton=make('marineResearchLab',()=>researchAct?.()),researchInfo=document.createElement('div');researchInfo.style.cssText='margin-top:8px;border-top:1px solid #50879c;padding-top:7px';
 const reportDetails=document.createElement('details');reportDetails.id='marineResearchReport';reportDetails.style.cssText='margin-top:8px;border-top:1px solid #50879c;padding-top:6px';const reportSummary=document.createElement('summary');reportSummary.textContent='Saved survey report';const reportBody=document.createElement('div');reportDetails.append(reportSummary,reportBody);let reportSignature='';
 enterButton.textContent='Walk research deck';helmButton.textContent='Return to helm';
 panel.append(title,message,choice,researchInfo,researchButton,actionButton,enterButton,helmButton,moorButton,result,reportDetails);document.body.append(panel);
 return {hide:()=>{panel.hidden=true},dispose:()=>{panel.remove();style.remove()},message:text=>{result.textContent=text},show:s=>{
  const research=s.research;researchInfo.hidden=!research?.visible;researchButton.hidden=!research?.visible||!s.active||s.target?.id!=='lab';researchInfo.textContent=research?.visible?`${research.instruction} ${research.message}`:'';researchButton.textContent=research?.labLabel||'Reef survey';researchButton.disabled=!research?.atLab||research?.busy;
  reportDetails.hidden=!research?.visible||!research?.completed;
  const signature=(research?.report||[]).map(e=>e.eventId).join('|');
  if(signature!==reportSignature){reportSignature=signature;reportBody.replaceChildren();for(const event of research?.report||[]){const item=document.createElement('p'),title=document.createElement('strong'),detail=document.createElement('div');title.textContent=event.name;detail.textContent=event.detail;item.append(title,detail);reportBody.append(item);}}
  panel.hidden=false;panel.dataset.active=String(s.active);choice.hidden=actionButton.hidden=helmButton.hidden=!s.active;enterButton.hidden=s.active;
  enterButton.disabled=!s.canEnter;moorButton.hidden=s.active;moorButton.textContent=s.moored?'Release mooring':'Moor vessel';
  message.textContent=s.active?`${s.target.label} · ${Math.round(s.distance)} m ${s.direction}. WASD walk; arrows turn.`:s.canEnter?(s.moored?'Moored. Explore the deck or release mooring to sail.':'Stop, moor and explore the deck.'):s.reason;
  actionButton.textContent=s.target?.action||'';actionButton.disabled=!s.active||s.distance>2.4||s.busy;
 }};
}
