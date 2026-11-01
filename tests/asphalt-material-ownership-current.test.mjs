import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {loadPbrTextureSet} from '../app/js/engine/materials-runtime.js';

test('the bundled asphalt is the intact licensed source triplet within a bounded texture budget',async()=>{
 const base=new URL('../app/assets/textures/earth/',import.meta.url),source=JSON.parse(await fs.readFile(new URL('asphalt-track-source.json',base),'utf8'));
 assert.equal(source.license,'CC0-1.0');assert.equal(source.tileMeters,2);assert.equal(source.files.length,3);
 let bytes=0;for(const f of source.files){const data=await fs.readFile(new URL(f.file,base));bytes+=data.length;assert.equal(data.length,f.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256);}
 assert.ok(bytes<2.2*1024*1024,'three shared 1K maps, not a per-road texture allocation');
});
test('a late image cannot republish or leak after the PBR owner has timed out',()=>{
 const priorT=globalThis.THREE,priorTimer=globalThis.setTimeout,loads=[];let timeout,publications=0;
 globalThis.THREE={sRGBEncoding:3001,RepeatWrapping:1000,TextureLoader:class {load(url,done,progress,fail){loads.push({url,done,fail});}}};
 globalThis.setTimeout=fn=>{timeout=fn;return 1;};
 try {
  const fallback={diff:{},nor:{},rough:{}};
  loadPbrTextureSet('asphalt',{diff:'d',nor:'n',rough:'r'},(d,n,r,primary)=>{publications++;assert.equal(primary,false);assert.deepEqual({diff:d,nor:n,rough:r},fallback);},()=>fallback);
  timeout();let disposed=0;for(const load of loads)load.done({dispose(){disposed++;}});
  assert.equal(publications,1);assert.equal(disposed,3);
 }finally{globalThis.THREE=priorT;globalThis.setTimeout=priorTimer;}
});
