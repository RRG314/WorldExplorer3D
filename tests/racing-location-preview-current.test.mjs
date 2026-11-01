import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceLocationPreview} from '../app/js/racing/location-preview.js';

function harness({blank=false,tainted=false}={}) {
 const previous={document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let system,encode,active=true,unregistered=0,allocations=0,revoked=[],images=[],unavailable=0,reads=0;
 const canvas={width:0,height:0,getContext:()=>({drawImage(){reads++;},getImageData(){if(tainted)throw Error('tainted');const data=new Uint8Array(256);if(!blank)data[64]=255;return {data};}}),toBlob:callback=>{encode=callback;}};
 globalThis.document={hidden:false,createElement:type=>{assert.equal(type,'canvas');return canvas;}};
 URL.createObjectURL=()=>`blob:preview-${++allocations}`;URL.revokeObjectURL=url=>revoked.push(url);
 const c={gameStarted:true,worldPublication:{requestId:'original'},renderer:{domElement:{width:1920,height:1080}},scene:{},camera:{},registerRuntimeSystem:definition=>{system=definition;return ()=>unregistered++;}};
 const owner=createRaceLocationPreview(c,{isCurrent:()=>active,onImage:url=>images.push(url),onUnavailable:()=>unavailable++});
 return {c,canvas,owner,frame(publication=c.worldPublication){system.update({flags:{mainWorldPresented:publication}});},encode(){encode(new Blob(['pixels']));},close(){active=false;},
  stats:()=>({unregistered,allocations,revoked,images,unavailable,reads}),restore(){owner.dispose();globalThis.document=previous.document;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;}};
}
test('a location preview reads only a newly presented matching world and releases its bounded image',()=>{
 const h=harness();try{
  h.frame({requestId:'some-other-world'});assert.equal(h.stats().reads,0);
  h.frame();assert.equal(h.canvas.width,960);assert.equal(h.canvas.height,540);h.encode();h.frame();
  assert.deepEqual(h.stats(),{unregistered:1,allocations:1,revoked:[],images:['blob:preview-1'],unavailable:0,reads:1});
  h.owner.dispose();h.owner.dispose();assert.deepEqual(h.stats().revoked,['blob:preview-1']);assert.equal(h.stats().unregistered,1);
 }finally{h.restore();}
});
test('closing or replacing the world while image encoding is pending cannot publish or retain a preview',()=>{
 for(const change of ['close','world','renderer']){const h=harness();try{
  h.frame();if(change==='close')h.close();if(change==='world')h.c.worldPublication={requestId:'replacement'};if(change==='renderer')h.c.renderer={domElement:{width:1920,height:1080}};
  h.encode();assert.equal(h.stats().allocations,0);assert.deepEqual(h.stats().images,[]);assert.equal(h.stats().unregistered,1);
 }finally{h.restore();}}
});
test('blank and unreadable WebGL buffers use the map fallback without saving an image',()=>{
 for(const options of [{blank:true},{tainted:true}]){const h=harness(options);try{
  h.frame();assert.equal(h.stats().unavailable,1);assert.equal(h.stats().allocations,0);assert.equal(h.stats().unregistered,1);
 }finally{h.restore();}}
});
test('an obsolete capture is unregistered before reading a replacement world',()=>{
 const h=harness();try{h.c.worldPublication={requestId:'replacement'};h.frame();assert.equal(h.stats().reads,0);assert.equal(h.stats().unregistered,1);}finally{h.restore();}
});
