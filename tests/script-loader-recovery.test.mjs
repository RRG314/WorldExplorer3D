import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScript } from '../app/js/modules/script-loader.js';
function install(t) {
 const prior=globalThis.document;const scripts=[];
 class Script extends EventTarget {dataset={};remove(){const i=scripts.indexOf(this);if(i>=0)scripts.splice(i,1);}}
 globalThis.document={scripts,createElement:()=>new Script(),head:{appendChild:s=>scripts.push(s)}};
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
 const {scripts,Script}=install(t);const s=new Script();s.src='existing.js';scripts.push(s);
 await assert.rejects(loadClassicScript('existing.js',{timeoutMs:5}),/timeout/);assert.equal(scripts.length,0);
});
test('concurrent callers share one load and error recovery creates one replacement',async t=>{
 const {scripts}=install(t);const a=loadClassicScript('error.js'),b=loadClassicScript('error.js');assert.equal(a,b);
 const rejected=assert.rejects(a,/Failed/);scripts[0].dispatchEvent(new Event('error'));await rejected;assert.equal(scripts.length,0);
 const retry=loadClassicScript('error.js');scripts[0].dispatchEvent(new Event('load'));await retry;
 await loadClassicScript('error.js');assert.equal(scripts.length,1);
});
