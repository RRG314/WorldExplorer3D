import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFloatElevationTiff, isPolarElevationTile, mergePolarElevation, polarElevationUrl, polarSourceAt } from '../app/js/terrain/polar-elevation-source.js';

function rasterFixture(values = [2.8, 10, -9999, 35], big = false) {
  const buffer = new ArrayBuffer(192), v = new DataView(buffer), little = !big;
  v.setUint16(0, big ? 0x4d4d : 0x4949, little); v.setUint16(2, 42, little); v.setUint32(4, 8, little);
  const entries = [[256,2],[257,2],[258,32],[259,1],[277,1],[322,2],[323,2],[324,176],[325,16],[339,3]];
  v.setUint16(8, entries.length, little);
  entries.forEach(([tag,value],i) => { const p=10+i*12;v.setUint16(p,tag,little);v.setUint16(p+2,4,little);v.setUint32(p+4,1,little);v.setUint32(p+8,value,little); });
  values.forEach((value,i)=>v.setFloat32(176+i*4,value,little));return buffer;
}
test('Float32 elevations retain negative heights and treat provider voids as missing', () => {
  for (const big of [false,true]) {
    const raster=decodeFloatElevationTiff(rasterFixture([2.8,-20,-9999,35],big));
    assert.ok(Math.abs(raster.values[0]-2.8)<1e-6);assert.equal(raster.values[1],-20);assert.ok(Number.isNaN(raster.values[2]));
    const fallback=new Float32Array([-18,-21,-30,-5]);const merged=mergePolarElevation(fallback,raster);
    assert.equal(merged.count,3);assert.equal(fallback[2],-30);assert.equal(fallback[3],35);
  }
  assert.throws(()=>decodeFloatElevationTiff(new ArrayBuffer(10)));
  const changed=rasterFixture();new DataView(changed).setUint32(10+3*12+8,5,true);
  assert.throws(()=>decodeFloatElevationTiff(changed),/encoding/);
});
test('orthometric request uses geographic coverage, explicit datum operation and shared-edge pixel centers',()=>{
  assert.equal(isPolarElevationTile(15,10553,24191),true);assert.equal(isPolarElevationTile(15,9000,12000),false);
  const url=new URL(polarElevationUrl(15,10553,24191));
  assert.equal(JSON.parse(url.searchParams.get('renderingRule')).rasterFunction,'Height Orthometric');
  const bbox=url.searchParams.get('bbox').split(',').map(Number),next=new URL(polarElevationUrl(15,10554,24191)).searchParams.get('bbox').split(',').map(Number);
  const pixel=(bbox[2]-bbox[0])/256;
  assert.ok(Math.abs((bbox[2]-pixel/2)-(next[0]+pixel/2))<1e-6);
});
test('point attribution does not call a mixed or fallback cell measured polar data',()=>{
  const polarMask=new Uint8Array(65536);polarMask.fill(1);
  assert.equal(polarSourceAt({polarMask},.5,.5).verticalDatum,'EGM2008');
  polarMask[127*256+127]=0;assert.equal(polarSourceAt({polarMask},.5,.5),null);
});

test('provider work is bounded and world teardown cancels both active and queued requests', async () => {
  const {fetchPolarElevationTile} = await import('../app/js/terrain/polar-elevation-source.js');
  const originalFetch=globalThis.fetch;let active=0,peak=0,started=0;
  globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>{
    active++;started++;peak=Math.max(peak,active);
    signal.addEventListener('abort',()=>{active--;reject(new Error('aborted'));},{once:true});
  });
  const controllers=Array.from({length:10},()=>new AbortController());
  try {
    const jobs=controllers.map((c,i)=>fetchPolarElevationTile(15,10553+i,24191,{signal:c.signal}));
    assert.equal(started,3);
    controllers.slice(3).forEach(c=>c.abort());controllers.slice(0,3).forEach(c=>c.abort());
    assert.deepEqual(await Promise.all(jobs),Array(10).fill(null));
    assert.equal(peak,3);assert.equal(active,0);assert.equal(started,3);
  } finally {controllers.forEach(c=>c.abort());globalThis.fetch=originalFetch;}
});
