import test from 'node:test';
import assert from 'node:assert/strict';
import {localTransportFallback,completeFixedRegionalTransportLoad} from '../app/js/world/fixed-regional-context.js';
const location={lat:0,lon:0};
const data={_shortbreadTiles:{zoom:14,loaded:1,requested:1,failed:0,bounds:{minLat:-.01,maxLat:.01,minLon:-.01,maxLon:.01}},elements:[{type:'node',id:1,lat:0,lon:0},{type:'node',id:2,lat:.001,lon:0},{type:'way',id:3,nodes:[1,2],tags:{highway:'residential',name:'Local detail'}}]};
test('complete finer local data is available as a bounded street fallback',()=>{
 const result=localTransportFallback(data,location);assert.equal(result.radiusMeters,1105.4);assert.equal(result.data.elements.length,3);
});
test('incomplete, coarser, or missing-node data cannot suppress regional coverage',()=>{
 for(const meta of [{failed:1},{zoom:13},{loaded:0}])assert.equal(localTransportFallback({...data,_shortbreadTiles:{...data._shortbreadTiles,...meta}},location),null);
 assert.equal(localTransportFallback({...data,elements:data.elements.slice(1)},location),null);
});
test('failed exact request preserves available local detail instead of replacing it with coarse core streets',async()=>{
 const metrics={};const result=await completeFixedRegionalTransportLoad({appCtx:{worldTraversalRadiusWorld:0},coreRadiusMeters:1000,exactTransportLoaded:false,fallbackCoreData:data,loadMetrics:metrics,request:{location,bounds:data._shortbreadTiles.bounds,radiusMeters:14000,outcome:Promise.resolve({value:{...data,elements:data.elements.map(e=>e.type==='way'?{...e,tags:{highway:'residential',name:'Coarse core'}}:e)}})}});
 assert.equal(result.elements.filter(e=>e.type==='way').length,1);
 assert.equal(result.elements.find(e=>e.type==='way').tags.name,'Local detail');
 assert.equal(metrics.regionalTransport.playableCoreSource,'shortbread-z14');
});
