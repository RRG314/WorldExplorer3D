import assert from 'node:assert/strict';
import test from 'node:test';
import {ctx} from '../app/js/shared-context.js?v=55';
const originalWindow=globalThis.window;
globalThis.window={addEventListener(){}};
const {positionTopOverlays}=await import('../app/js/main.js');
if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;

function fixture(displays,run){
  const previous={window:globalThis.window,document:globalThis.document,gameStarted:ctx.gameStarted};
  const measured=[];
  const element=(id,rect,display='block')=>({style:{display},getBoundingClientRect(){measured.push(id);return rect;}});
  const elements={
    hud:element('hud',{left:0,right:200,top:10,width:200,height:40}),
    mainMenuBtn:element('mainMenuBtn',{left:900,right:1000,top:10,width:100,height:40}),
    debugOverlay:element('debugOverlay',{width:100,height:30},displays[0]),
    perfPanel:element('perfPanel',{width:120,height:30},displays[1])
  };
  globalThis.window={innerWidth:1200,getComputedStyle:e=>({display:e.style.display,visibility:'visible'})};
  globalThis.document={getElementById:id=>elements[id]||null};
  ctx.gameStarted=true;
  try {run({elements,measured});}finally{
    for(const key of ['window','document'])if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];
    ctx.gameStarted=previous.gameStarted;
  }
}

test('hidden diagnostic overlays do not force HUD or menu layout reads',()=>fixture(['none','none'],({measured})=>{
  for(let i=0;i<150;i++)positionTopOverlays();
  assert.deepEqual(measured,[]);
}));
test('visible diagnostic overlays retain their bounded positions and resume after showing',()=>fixture(['none','none'],({elements,measured})=>{
  positionTopOverlays();
  elements.debugOverlay.style.display='block';elements.perfPanel.style.display='block';
  positionTopOverlays();
  assert.equal(elements.debugOverlay.style.left,'325px');
  assert.equal(elements.perfPanel.style.left,'665px');
  assert.equal(elements.perfPanel.style.right,'auto');
  assert.ok(measured.includes('hud')&&measured.includes('mainMenuBtn'));
  elements.debugOverlay.style.display='none';elements.perfPanel.style.display='none';
  const count=measured.length;positionTopOverlays();assert.equal(measured.length,count);
}));
