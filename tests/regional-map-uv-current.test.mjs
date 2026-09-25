import test from 'node:test';
import assert from 'node:assert/strict';
import { regionalMapUv } from '../app/js/planetary/regional-map-uv.js';
const equator={latitudeDeg:0,longitudeDegPositiveEast:0,radiusM:1_000_000};
test('regional map covers metres at the named site, not a globe per tile',()=>{
 const center=regionalMapUv(equator,0,0);assert.equal(center.u,0);assert.equal(center.v,.5);
 const east=regionalMapUv(equator,1000,0);assert.ok(Math.abs(east.u-1000/(2*Math.PI*equator.radiusM))<1e-12);
 const north=regionalMapUv(equator,0,-1000);assert.ok(north.v>.5);
});
test('polar patches and longitude seams remain continuous and finite',()=>{
 for(const latitudeDeg of [-90,-82,82,90])for(const x of [-8000,0,8000])for(const z of [-8000,0,8000]){
  const uv=regionalMapUv({...equator,latitudeDeg},x,z);assert.ok(Number.isFinite(uv.u)&&Number.isFinite(uv.v));assert.ok(uv.v>=0&&uv.v<=1);
 }
 const site={...equator,longitudeDegPositiveEast:359.99};
 assert.ok(regionalMapUv(site,1000,0).u>1,'unwrapped seam avoids interpolating across the whole image');
});
