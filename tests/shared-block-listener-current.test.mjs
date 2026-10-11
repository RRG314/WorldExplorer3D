import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as catalogue from '../app/js/block-builder/catalog.js';
const source=(await readFile(new URL('../app/js/multiplayer/blocks.js',import.meta.url),'utf8'))
 .replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g,'').replace(/export\s*\{[\s\S]*?\};\s*$/,'');
function harness(){
 let deliver,completeServer,closed=0,options;const rows=[];
 const context=vm.createContext({...catalogue,console,Promise,
  initFirebase:()=>({db:{}}),normalizeCode:v=>v,collection:()=>({}),query:()=>({}),limit:()=>({}),
  onSnapshot(_q,opts,callback){options=opts;deliver=callback;return()=>closed++;},
  getDocsFromServer:()=>new Promise(resolve=>{completeServer=resolve;})});
 vm.runInContext(source,context);const stop=context.listenSharedBlocks('ROOM',value=>rows.push(value));
 const snap=(values,metadata={})=>({metadata,forEach:fn=>values.forEach((data,i)=>fn({id:`b${i}`,data:()=>data}))});
 return{rows,stop,deliver:(values,metadata)=>deliver(snap(values,metadata)),server:(values,metadata)=>completeServer(snap(values,metadata)),options,closed:()=>closed};
}
const block={gx:1,gy:0,gz:1};
test('local pending echoes do not become accepted room content; metadata acknowledgement publishes',async()=>{
 const h=harness();assert.equal(h.options.includeMetadataChanges,true);
 h.deliver([block],{hasPendingWrites:true});assert.equal(h.rows.length,0);
 h.server([]);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.rows.length,0,'an older initial read cannot erase the pending preview');
 h.deliver([block],{hasPendingWrites:false});assert.equal(h.rows.length,1);assert.equal(h.rows[0].length,1);
 h.stop();h.deliver([]);assert.equal(h.rows.length,1);assert.equal(h.closed(),1);
});
test('initial server confirmation fills an empty cache but cannot replace a later removal',async()=>{
 const initial=harness();initial.deliver([],{fromCache:true});initial.server([block]);await new Promise(resolve=>setImmediate(resolve));assert.equal(initial.rows.at(-1).length,1);initial.stop();
 const changed=harness();changed.deliver([block]);changed.deliver([]);changed.server([block]);await new Promise(resolve=>setImmediate(resolve));assert.equal(changed.rows.at(-1).length,0);changed.stop();
});
