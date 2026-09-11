import test from 'node:test';
import assert from 'node:assert/strict';
import {worldCoverSourceTile,readWorldCoverClasses} from '../scripts/lib/worldcover-categorical.mjs';
import {decodeWorldCoverNpy,fetchWorldCoverClasses,worldCoverWindows} from '../app/js/terrain/worldcover-categorical.js';

function raster(width,height,value) {
 const header=new TextEncoder().encode(`{'descr': '|u1', 'fortran_order': False, 'shape': (1, ${height}, ${width}), }\n`);
 const bytes=new Uint8Array(10+header.length+width*height);
 bytes.set([147,78,85,77,80,89,1,0]);new DataView(bytes.buffer).setUint16(8,header.length,true);
 bytes.set(header,10);bytes.fill(value,10+header.length);return bytes;
}
test('bounded numeric raster decoding preserves classes and rejects malformed data',()=>{
 assert.deepEqual([...decodeWorldCoverNpy(raster(2,2,95).buffer,2,2)],[95,95,95,95]);
 assert.throws(()=>decodeWorldCoverNpy(raster(2,2,123).buffer,2,2));
 assert.throws(()=>decodeWorldCoverNpy(raster(2,2,10).buffer,4,4));
});
test('browser delivery uses fixed asset, nearest resampling, and bounded windows',async()=>{
 const calls=[];
 const data=await fetchWorldCoverClasses({latS:1,latN:2,lonW:-.5,lonE:.5},4,undefined,async url=>{
  calls.push(url);const match=url.match(/\/(\d+)x(\d+)\.npy/);
  assert.ok(url.includes('resampling=nearest') && url.includes('return_mask=false'));
  return new Response(raster(Number(match[1]),Number(match[2]),url.includes('W003')?70:10));
 });
 assert.equal(calls.length,2);assert.deepEqual([...data.slice(0,4)],[70,70,10,10]);
});
test('categorical tile names use southwest source origin across hemispheres',()=>{
 assert.equal(worldCoverSourceTile(39.29,-76.61).id,'N39W078');
 assert.equal(worldCoverSourceTile(-2.1,-59.9).id,'S03W060');
 assert.equal(worldCoverSourceTile(0,-.01).id,'N00W003');
});
test('edge-of-world tiles remain bounded and nodata is not invented vegetation',()=>{
 for(const [lonW,lonE,expected] of [[179.9,180,'E177'],[-180,-179.9,'W180']]) {
  const windows=worldCoverWindows({latS:0,latN:.1,lonW,lonE},4);
  assert.equal(windows.length,1);assert.ok(windows[0].tile.id.endsWith(expected));
 }
 assert.deepEqual([...decodeWorldCoverNpy(raster(2,2,0).buffer,2,2)],[0,0,0,0]);
 assert.throws(()=>worldCoverWindows({latS:0,latN:1,lonW:179,lonE:-179},4));
});
test('oversized responses and aborted requests cannot become cached class tiles',async()=>{
 const bounds={latS:1,latN:2,lonW:1,lonE:2};
 await assert.rejects(fetchWorldCoverClasses(bounds,4,null,async()=>new Response(new Uint8Array(32769))),/bounded payload/);
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(fetchWorldCoverClasses(bounds,4,controller.signal,async()=>{calls++;return new Response(raster(4,4,10));}),{name:'AbortError'});
 assert.equal(calls,0);
});
test('cross-border windows preserve class bytes and placement without RGB interpolation',async()=>{
 const calls=[];
 const decoder={fromUrl:async(url,options)=>{assert.equal(options.allowFullFile,false);return {readRasters:async o=>{calls.push(o);assert.equal(o.resampleMethod,'nearest');return new Uint8Array(o.width*o.height).fill(url.includes('E000')?10:70);}};}};
 const data=await readWorldCoverClasses({latS:1,latN:2,lonW:-1,lonE:1},4,null,decoder);
 assert.equal(calls.length,2);assert.deepEqual([...data],[70,70,10,10,70,70,10,10,70,70,10,10,70,70,10,10]);
});
