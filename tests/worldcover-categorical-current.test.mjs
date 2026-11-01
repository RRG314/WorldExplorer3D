import test from 'node:test';
import assert from 'node:assert/strict';
import {worldCoverSourceTile,readWorldCoverClasses} from '../scripts/lib/worldcover-categorical.mjs';
import {decodeWorldCoverNpy,fetchWorldCoverClasses,worldCoverWindows,worldCoverTilePlan} from '../app/js/terrain/worldcover-categorical.js';

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
  calls.push(url);assert.match(url,/\/item\/tiles\/WebMercatorQuad\/\d+\/\d+\/\d+\.npy\?/);
  assert.ok(url.includes('resampling=nearest') && url.includes('return_mask=false'));
  return new Response(raster(256,256,url.includes('W003')?70:10));
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
 await assert.rejects(fetchWorldCoverClasses(bounds,4,null,async()=>new Response(new Uint8Array(71000))),/bounded payload/);
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(fetchWorldCoverClasses(bounds,4,controller.signal,async()=>{calls++;return new Response(raster(4,4,10));}),{name:'AbortError'});
 assert.equal(calls,0);
});
test('raw tile plans cover each target once, choose the native source and keep a bounded geographic sampling error',()=>{
 for(const bounds of [
  {latS:39.28,latN:39.30,lonW:-76.62,lonE:-76.60},
  {latS:-2.1,latN:.9,lonW:-61.1,lonE:-58.1},
  {latS:79,latN:82,lonW:2.99999,lonE:3.00001},
  {latS:1,latN:1.00001,lonW:177,lonE:180},
  {latS:0,latN:.1,lonW:-180,lonE:-179.9}]){
  const size=128,seen=new Set(),plan=worldCoverTilePlan(bounds,size);assert.ok(plan.length>0&&plan.length<=16);
  for(const group of plan){
   const pixels=256*2**group.zoom;
   for(let i=0;i<group.samples.length;i+=2){
    const index=group.samples[i],sample=group.samples[i+1];assert.ok(!seen.has(index));seen.add(index);assert.ok(sample>=0&&sample<65536);
    const px=group.x*256+sample%256,py=group.y*256+Math.floor(sample/256),lon=(px+.5)/pixels*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(py+.5)/pixels)))*180/Math.PI;
    assert.equal(worldCoverSourceTile(lat,lon).id,group.source.id);
    const targetLon=bounds.lonW+(index%size+.5)/size*(bounds.lonE-bounds.lonW),targetLat=bounds.latN-(Math.floor(index/size)+.5)/size*(bounds.latN-bounds.latS);
    const targetX=(targetLon+180)/360*pixels,targetY=(1-Math.asinh(Math.tan(targetLat*Math.PI/180))/Math.PI)/2*pixels;
    assert.ok(Math.abs(targetX-(px+.5))<=.500001);assert.ok(Math.abs(targetY-(py+.5))<=.500001);
   }
  }
  assert.equal(seen.size,size*size);
 }
 assert.throws(()=>worldCoverTilePlan({latS:85,latN:86,lonW:0,lonE:1},128),/latitude/);
});
test('native class bytes map directly into their planned target cells without display-colour conversion',async()=>{
 const bounds={latS:2.8,latN:3.2,lonW:2.8,lonE:3.2},size=16,plan=worldCoverTilePlan(bounds,size),values=[10,20,30,40,50,60,70,80,90,95,100];
 const expected=new Uint8Array(size*size);
 const data=await fetchWorldCoverClasses(bounds,size,null,async url=>{
  const match=new URL(url),group=plan.find(g=>match.pathname.endsWith(`/${g.zoom}/${g.x}/${g.y}.npy`)&&match.searchParams.get('item').endsWith(g.source.id));assert.ok(group);
  const bytes=raster(256,256,0),view=decodeWorldCoverNpy(bytes.buffer,256,256);for(let i=0;i<view.length;i++)view[i]=values[i%values.length];bytes.set(view,bytes.length-view.length);
  for(let i=0;i<group.samples.length;i+=2)expected[group.samples[i]]=view[group.samples[i+1]];
  return new Response(bytes);
 });
 assert.deepEqual(data,expected);
});
test('cancellation during a raw response cancels its reader and publishes no partial mosaic',async()=>{
 const controller=new AbortController();let cancelled=false;
 const stream=new ReadableStream({pull(stream){stream.enqueue(new Uint8Array([147]));controller.abort();},cancel(){cancelled=true;}});
 await assert.rejects(fetchWorldCoverClasses({latS:1,latN:2,lonW:1,lonE:2},4,controller.signal,async()=>new Response(stream)),{name:'AbortError'});
 assert.equal(cancelled,true);
});
test('cross-border windows preserve class bytes and placement without RGB interpolation',async()=>{
 const calls=[];
 const decoder={fromUrl:async(url,options)=>{assert.equal(options.allowFullFile,false);return {readRasters:async o=>{calls.push(o);assert.equal(o.resampleMethod,'nearest');return new Uint8Array(o.width*o.height).fill(url.includes('E000')?10:70);}};}};
 const data=await readWorldCoverClasses({latS:1,latN:2,lonW:-1,lonE:1},4,null,decoder);
 assert.equal(calls.length,2);assert.deepEqual([...data],[70,70,10,10,70,70,10,10,70,70,10,10,70,70,10,10]);
});
