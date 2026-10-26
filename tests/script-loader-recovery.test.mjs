import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScript, STARTUP_SCRIPT_TIMEOUT_MS } from '../app/js/modules/script-loader.js';
function install(t) {
 const prior=globalThis.document;const scripts=[];
 class Script extends EventTarget {dataset={};remove(){const i=scripts.indexOf(this);if(i>=0)scripts.splice(i,1);}}
 globalThis.document={baseURI:'https://game.invalid/app/',scripts,createElement:()=>new Script(),head:{appendChild:s=>scripts.push(s)}};
 t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 return {scripts,Script};
}
test('timeout removes stale script and retry loads a fresh element',async t=>{
 const {scripts}=install(t);
 await assert.rejects(loadClassicScript('timeout.js',{timeoutMs:5}),/timeout/);assert.equal(scripts.length,0);
 const p=loadClassicScript('timeout.js',{timeoutMs:100});assert.equal(scripts.length,1);
 scripts[0].dispatchEvent(new Event('load'));await p;assert.equal(scripts[0].dataset.loaded,'true');
});
test('existing unfinished script also times out and is removed',async t=>{
 const {scripts,Script}=install(t);const s=new Script();s.src='https://game.invalid/app/existing.js';scripts.push(s);
 await assert.rejects(loadClassicScript('existing.js',{timeoutMs:5}),/timeout/);assert.equal(scripts.length,0);
});
test('relative and absolute script requests preserve one loaded renderer identity',async t=>{
 const {scripts}=install(t);
 const first=loadClassicScript('/app/vendor/three/build/three.min.js');
 const second=loadClassicScript('https://game.invalid/app/vendor/three/build/three.min.js');
 assert.equal(first,second);assert.equal(scripts.length,1);
 scripts[0].dispatchEvent(new Event('load'));await first;
 await loadClassicScript('vendor/three/build/three.min.js');assert.equal(scripts.length,1);
});
test('concurrent callers share one load and error recovery creates one replacement',async t=>{
 const {scripts}=install(t);const a=loadClassicScript('error.js'),b=loadClassicScript('error.js');assert.equal(a,b);
 const rejected=assert.rejects(a,/Failed/);scripts[0].dispatchEvent(new Event('error'));await rejected;assert.equal(scripts.length,0);
 const retry=loadClassicScript('error.js');scripts[0].dispatchEvent(new Event('load'));await retry;
 await loadClassicScript('error.js');assert.equal(scripts.length,1);
});
test('essential startup keeps one request alive past the former short deadline',async t=>{
 const {scripts}=install(t);t.mock.timers.enable({apis:['setTimeout']});
 const pending=loadClassicScript('slow-startup.js',{timeoutMs:STARTUP_SCRIPT_TIMEOUT_MS});
 let state='loading';pending.then(()=>{state='loaded';},()=>{state='failed';});
 t.mock.timers.tick(15000);await Promise.resolve();assert.equal(state,'loading');assert.equal(scripts.length,1);
 assert.equal(loadClassicScript('slow-startup.js',{timeoutMs:STARTUP_SCRIPT_TIMEOUT_MS}),pending);
 scripts[0].dispatchEvent(new Event('load'));await pending;assert.equal(state,'loaded');
 t.mock.timers.tick(STARTUP_SCRIPT_TIMEOUT_MS);await Promise.resolve();assert.equal(scripts.length,1);assert.equal(state,'loaded');
});
test('an unresponsive startup request still reaches terminal recovery once',async t=>{
 const {scripts}=install(t);t.mock.timers.enable({apis:['setTimeout']});
 const pending=loadClassicScript('stalled-startup.js',{timeoutMs:STARTUP_SCRIPT_TIMEOUT_MS});
 const failed=assert.rejects(pending,/Script load timeout \(90000ms\)/);
 t.mock.timers.tick(STARTUP_SCRIPT_TIMEOUT_MS-1);assert.equal(scripts.length,1);
 t.mock.timers.tick(1);await failed;assert.equal(scripts.length,0);
 const retry=loadClassicScript('stalled-startup.js',{timeoutMs:STARTUP_SCRIPT_TIMEOUT_MS});assert.equal(scripts.length,1);
 scripts[0].dispatchEvent(new Event('load'));await retry;
});
