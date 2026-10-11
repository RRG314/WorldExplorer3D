import {RESEARCH_DECKS,RESEARCH_ROOMS,RESEARCH_STATIONS,researchDeckAt,researchRoomAt} from './interior-plan.js';
const ns='http://www.w3.org/2000/svg';
export function createResearchShipMap({select,onOpen=()=>{}}){
 const dialog=document.createElement('dialog');dialog.id='researchShipMap';dialog.setAttribute('aria-labelledby','researchShipMapTitle');
 dialog.innerHTML='<header><div><small>RESEARCH VESSEL</small><h2 id="researchShipMapTitle">Ship map</h2></div><button type="button" aria-label="Close ship map">Close</button></header><nav aria-label="Ship decks"></nav><div class="research-map-body"><svg viewBox="-9 -18 18 58" role="img" aria-label="Deck plan and walking route"></svg><div class="research-map-stations"></div></div><p class="research-map-location" role="status"></p><p class="research-map-tip">Choose a destination to set a walking route. Stairs connect the decks.</p>';
 const style=document.createElement('style');style.textContent=`
 #researchShipMap{width:min(700px,calc(100vw - 24px));max-height:calc(100dvh - 32px);box-sizing:border-box;padding:18px;border:1px solid var(--wx-line-soft,#52636f);border-radius:8px;background:var(--wx-panel,#0b161f);color:var(--wx-text,#f4f7f9);font:13px/1.5 Inter,system-ui,sans-serif;overflow:auto}
 #researchShipMap::backdrop{background:#0009}#researchShipMap>header{position:static;padding:0;background:none;display:flex;justify-content:space-between;align-items:center}#researchShipMap h2{font-size:20px;margin:2px 0 12px}#researchShipMap small{color:#9cabb8;font-size:10px;letter-spacing:.12em}
 #researchShipMap button{min-height:44px;border:1px solid #52636f;background:#14222d;color:inherit;border-radius:5px;padding:8px 12px;cursor:pointer;font:inherit}#researchShipMap button[aria-pressed=true]{border-color:#6db3ff;background:#173959}
 #researchShipMap nav{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}#researchShipMap nav button{flex:1;white-space:nowrap}.research-map-body{display:grid;grid-template-columns:1fr 1fr;gap:18px;min-height:250px}.research-map-body svg{width:100%;max-height:430px;background:#12232d;border:1px solid #405260;border-radius:5px}.research-map-stations{display:flex;flex-direction:column;gap:6px;justify-content:start}.research-map-stations button{text-align:left}.research-map-location{color:#d9e6ed}.research-map-tip{color:#a7b6c2;margin-bottom:0}
 @media(max-width:500px){#researchShipMap{padding:12px;font-size:12px}.research-map-body{grid-template-columns:1fr 1fr;gap:8px}.research-map-body svg{max-height:320px}.research-map-stations button{padding:7px}#researchShipMap nav{display:grid;grid-template-columns:1fr 1fr;gap:4px}#researchShipMap nav button{padding:6px;font-size:11px}}
 `;document.head.append(style);document.body.append(dialog);
 const nav=dialog.querySelector('nav'),svg=dialog.querySelector('svg'),list=dialog.querySelector('.research-map-stations');let state=null,deckId='main',signature='',lastDraw=-Infinity;
 function close(){if(dialog.open){dialog.close();onOpen(false);}}
 dialog.querySelector('header button').onclick=close;dialog.addEventListener('close',()=>onOpen(false));
 for(const deck of RESEARCH_DECKS){const button=document.createElement('button');button.type='button';button.textContent=deck.label;button.dataset.deck=deck.id;button.onclick=()=>{deckId=deck.id;signature='';render();};nav.append(button);}
 const element=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));svg.append(node);return node;};
 function render(){if(!dialog.open||!state)return;if(performance.now()-lastDraw<200&&signature)return;lastDraw=performance.now();const p=state.pose,deck=RESEARCH_DECKS.find(d=>d.id===deckId);
  for(const button of nav.children)button.setAttribute('aria-pressed',String(button.dataset.deck===deckId));
  svg.replaceChildren();svg.setAttribute('viewBox',deckId==='main'?'-9 -18 18 57':'-9 -18 18 22');
  element('rect',{x:-7,y:deckId==='main'?-17:-17,width:14,height:deckId==='main'?54:14,rx:.6,fill:'#1d343f',stroke:'#728692','stroke-width':.1});
  for(const room of RESEARCH_ROOMS.filter(r=>r.deck===deckId)){element('rect',{x:room.x0,y:-room.z1,width:room.x1-room.x0,height:room.z1-room.z0,fill:state.targetId===room.id?'#255582':'#294550',stroke:'#93aab5','stroke-width':.1});const label=element('text',{x:(room.x0+room.x1)/2,y:-(room.z0+room.z1)/2,'text-anchor':'middle','font-size':.5,fill:'#e1e9ed'});label.textContent=room.label;}
  element('rect',{x:-2.4,y:-10.8,width:4.8,height:7.5,fill:'#485359',stroke:'#acc0c5','stroke-width':.1});
  const t=element('text',{x:0,y:-7,'text-anchor':'middle','font-size':.7,fill:'#e6e9ed'});t.textContent='STAIRS';
  const route=state.route||[];let section=[];
  const flush=()=>{if(section.length>1)element('polyline',{points:section.map(n=>`${n.x},${-n.z}`).join(' '),fill:'none',stroke:'#f7bd57','stroke-width':.18,'stroke-dasharray':'.35 .2'});section=[];};
  for(const point of route){if(Math.abs(point.y-deck.y)<.35)section.push(point);else flush();}flush();
  for(const s of RESEARCH_STATIONS.filter(s=>s.deck===deckId))element('circle',{cx:s.x,cy:-s.z,r:.27,fill:s.id===state.targetId?'#ffca67':'#91aebd'});
  if(researchDeckAt(p).id===deckId){element('circle',{cx:p.x,cy:-p.z,r:.35,fill:'#5eb6ff',stroke:'white','stroke-width':.1});const arrow=element('path',{d:'M0,-.9L-.3,-.4L.3,-.4Z',fill:'#5eb6ff',transform:`translate(${p.x},${-p.z}) rotate(${p.yaw*180/Math.PI})`});}
  const key=`${deckId}:${state.targetId}`;if(key!==signature){signature=key;list.replaceChildren();for(const s of RESEARCH_STATIONS.filter(s=>s.deck===deckId)){const button=document.createElement('button');button.type='button';button.textContent=s.label;button.dataset.station=s.id;button.setAttribute('aria-pressed',String(state.targetId===s.id));button.onclick=()=>{select(s.id);close();};list.append(button);}if(!list.children.length){const note=document.createElement('p');note.textContent='Continue up for crew spaces and the bridge, or down to the main deck.';list.append(note);}}
  dialog.querySelector('.research-map-location').textContent=`You are in ${researchRoomAt(p).label} · ${researchDeckAt(p).label}. Blue: you. Gold: your route.`;
 }
 return {update:s=>{state=s;render();},open(){if(!state)return;deckId=researchDeckAt(state.pose).id;signature='';dialog.showModal();onOpen(true);render();},close,get isOpen(){return dialog.open;},dispose(){close();dialog.remove();style.remove();}};
}
