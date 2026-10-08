import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/index.html',import.meta.url),'utf8').match(/<script id="startupCoverController">([\s\S]*?)<\/script>/)[1];
function fixture(){
 const nodes=new Map(),listeners=new Map(),timers=new Map();
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{dataset:{state:'starting'},textContent:'',hidden:id==='loadRetry',attributes:{},classList:{shown:true,remove(){this.shown=false;}},setAttribute(k,v){this.attributes[k]=v;}});return nodes.get(id);}};
 const win={addEventListener(k,f){listeners.set(k,f);},removeEventListener(k){listeners.delete(k);}};
 vm.runInNewContext(source,{document:doc,window:win,setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)});
 return {doc,listeners,timers,emit:(type,event={})=>listeners.get(type)?.(event)};
}
test('an unavailable critical module has recovery before the application exists',()=>{
 const f=fixture();f.emit('error',{target:{tagName:'SCRIPT',hasAttribute:n=>n==='data-startup-critical'}});
 assert.equal(f.doc.getElementById('loading').dataset.state,'error');assert.equal(f.doc.getElementById('loadRetry').hidden,false);assert.equal(f.doc.getElementById('loadProgress').hidden,true);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('optional scripts and image errors do not terminate startup',()=>{
 const f=fixture();f.emit('error',{target:{tagName:'SCRIPT',hasAttribute:()=>false}});f.emit('error',{target:{tagName:'IMG',hasAttribute:()=>true}});
 assert.equal(f.doc.getElementById('loading').dataset.state,'starting');assert.equal(f.timers.size,1);
});
test('runtime readiness hands off once and releases the startup listeners and timer',()=>{
 const f=fixture();f.emit('we3d:runtime-ready');assert.equal(f.doc.getElementById('loading').classList.shown,false);assert.equal(f.doc.getElementById('loading').attributes['aria-busy'],'false');assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('startup completion cannot dismiss an active direct world journey',()=>{
 const f=fixture();f.doc.getElementById('loading').dataset.state='loading';f.emit('we3d:runtime-ready');assert.equal(f.doc.getElementById('loading').classList.shown,true);assert.equal(f.doc.getElementById('loading').dataset.state,'loading');assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});
test('a slow connection offers reload without inventing failure or completion',()=>{
 const f=fixture();f.timers.get(1)();assert.equal(f.doc.getElementById('loading').dataset.state,'starting');assert.equal(f.doc.getElementById('loadRetry').hidden,false);assert.equal(f.doc.getElementById('loadProgress').hidden,false);f.emit('we3d:runtime-ready');assert.equal(f.doc.getElementById('loading').classList.shown,false);
});
test('bootstrap failures reach the same independent recovery screen',()=>{
 const f=fixture();f.emit('we3d:startup-failed');assert.equal(f.doc.getElementById('loading').dataset.state,'error');assert.equal(f.doc.getElementById('loadRetry').hidden,false);assert.equal(f.timers.size,0);
});
