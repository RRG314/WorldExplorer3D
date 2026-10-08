import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingPresentation, loadingCardsForMode, LOADING_CARDS, nextLoadingProgress} from '../app/js/ui/loading-progress.js';

function fixture() {
  const nodes = new Map();
  const doc = {hidden:false, documentElement:{dataset:{}}, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {textContent:'',dataset:{},attributes:{},events:{},hidden:false,
      classList:{contains:()=>true},addEventListener(name,fn){this.events[name]=fn;},
      setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}});
    return nodes.get(id);
  }};
  let serial = 0;
  const timers = new Map();
  const ui = createLoadingPresentation(doc,{setInterval:fn=>{timers.set(++serial,fn);return serial;},clearInterval:id=>timers.delete(id)});
  const tick = () => {for(const fn of timers.values()) fn();};
  const click = id => doc.getElementById(id).events.click();
  return {doc,ui,timers,tick,click};
}

test('pipeline progress cannot retreat, invent time-based progress, or finish early',()=>{
  let state=nextLoadingProgress(null);
  assert.equal(state.value,3);
  state=nextLoadingProgress(state,{phase:'publishCompiledTransportMeshes'});
  assert.equal(state.value,62);
  assert.equal(nextLoadingProgress(state,{phase:'fetchOverpass'}),state);
  assert.equal(nextLoadingProgress(state,{phase:'unknown',progress:100}),state);
  state=nextLoadingProgress(state,{phase:'publishStreetPavement',completed:50,total:100});
  assert.equal(state.value,79.5);
  for(const completed of [100,200]) assert.equal(nextLoadingProgress(state,{phase:'publishStreetPavement',completed,total:100}).value,87);
  assert.equal(nextLoadingProgress(state,{phase:'worldDiscovery'}).value,99);
  for(const [completed,total] of [[NaN,10],[10,Infinity],[10,0],[-10,20]]) {
    assert.equal(nextLoadingProgress(state,{phase:'publishStreetPavement',completed,total}),state);
  }
  assert.equal(nextLoadingProgress(state,{restart:true}).value,3);
});

test('short transitions and other worlds do not claim measured Earth progress',()=>{
  for(const mode of ['space','moon','mars','ocean']) {
    const state=nextLoadingProgress(null,{mode});
    assert.equal(state.value,null);
    assert.equal(nextLoadingProgress(state,{phase:'worldDiscovery'}).value,null);
    assert.doesNotMatch(state.label,/streets|roads/i);
  }
  assert.equal(nextLoadingProgress(null,{transition:true}).value,null);
  assert.equal(nextLoadingProgress({mode:'space',value:null},{mode:'earth'}).value,3);
});

test('feature decks prioritize the destination without duplicates or missing cards',()=>{
  assert.equal(new Set(LOADING_CARDS.map(card=>card.id)).size,LOADING_CARDS.length);
  for(const mode of ['earth','ocean','space','moon','mars']) {
    const deck=loadingCardsForMode(mode);
    assert.equal(deck.length,LOADING_CARDS.length);
    assert.equal(new Set(deck.map(card=>card.id)).size,LOADING_CARDS.length);
    assert.ok(deck[0].modes.includes(mode));
  }
});

test('tip timer rotates content without moving progress and is released on hide/restart',()=>{
  const {ui,timers,tick,doc}=fixture();
  ui.show({mode:'earth'});
  const first=ui.snapshot();tick();
  assert.notEqual(ui.snapshot().card,first.card);
  assert.equal(ui.snapshot().value,first.value);
  for(let i=0;i<15;i++)ui.show({phase:'publishStreetPavement',completed:i,total:20});
  assert.equal(timers.size,1);
  ui.show({restart:true,mode:'space'});
  assert.equal(timers.size,1);assert.equal(ui.snapshot().card,'ship');
  ui.hide();assert.equal(timers.size,0);
  assert.equal(doc.getElementById('loading').attributes['aria-busy'],'false');
  ui.show({mode:'earth'});assert.equal(ui.snapshot().value,3);ui.hide();
});

test('manual browsing pauses rotation, play resumes, and hidden/reduced-motion pages hold the card',()=>{
  const {ui,tick,doc,click}=fixture();ui.show({mode:'earth'});
  click('loadTipNext');const next=ui.snapshot().card;tick();assert.equal(ui.snapshot().card,next);
  assert.equal(ui.snapshot().paused,true);
  click('loadTipPause');tick();assert.notEqual(ui.snapshot().card,next);
  doc.hidden=true;const hidden=ui.snapshot().card;tick();assert.equal(ui.snapshot().card,hidden);
  doc.hidden=false;doc.documentElement.dataset.we3dMotion='reduce';
  ui.show({restart:true});assert.equal(ui.snapshot().paused,true);
  click('loadTipPrevious');assert.equal(ui.snapshot().card,loadingCardsForMode('earth').at(-1).id);
  click('loadTipPause');tick();assert.equal(ui.snapshot().card,loadingCardsForMode('earth')[0].id);
  ui.hide();
});

test('fatal startup stops the tip timer instead of suggesting work is continuing',()=>{
  const {ui,timers,tick,doc}=fixture();ui.show();
  doc.getElementById('loading').dataset.state='error';tick();
  assert.equal(timers.size,0);assert.equal(ui.snapshot().active,false);
});
