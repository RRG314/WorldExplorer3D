import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CELL_REQUESTS,
  fetchMappedAirportData,
  isAirportSelection,
  normalizeAirportBounds,
  splitBounds
} from '../app/js/world/osm-airport-source.js';

function airportSelection(overrides = {}) {
  return {
    lat: 39.1747196,
    lon: -76.6707551,
    locationDetails: {
      isAirport: true,
      airportClass: 'international',
      airportBounds: {
        minLat: 39.1578912,
        maxLat: 39.1949606,
        minLon: -76.7154717,
        maxLon: -76.6449952
      }
    },
    ...overrides
  };
}

test('only an explicit airport selection authorizes the bounded exact airport source', () => {
  assert.equal(isAirportSelection({ lat: 39.29, lon: -76.61, locationDetails: { kind: 'City' } }), false);
  assert.equal(normalizeAirportBounds({ lat: 39.29, lon: -76.61, locationDetails: { kind: 'City' } }), null);
  assert.equal(isAirportSelection({ lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }), true);
  assert.ok(normalizeAirportBounds({ lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }));
  assert.equal(isAirportSelection(airportSelection()), true);
  const bounds = normalizeAirportBounds(airportSelection());
  assert.ok(bounds.minLat < 39.1747 && bounds.maxLat > 39.1747);
  assert.ok(bounds.minLon < -76.6707 && bounds.maxLon > -76.6707);
  assert.ok(bounds.maxLat - bounds.minLat <= .085);
  assert.ok(bounds.maxLon - bounds.minLon <= .085);
});

test('airport map requests are divided into a bounded number of small cells', () => {
  const cells = splitBounds(normalizeAirportBounds(airportSelection()));
  assert.ok(cells.length > 1);
  assert.ok(cells.length <= MAX_CELL_REQUESTS);
  for (const cell of cells) {
    assert.ok(cell.maxLat - cell.minLat <= .0200001);
    assert.ok(cell.maxLon - cell.minLon <= .0200001);
  }
});

test('the fallback retains exact airport facilities and access paths with their geometry nodes', async () => {
  const previousFetch = globalThis.fetch;
  let active = 0;
  let maximumActive = 0;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: 1, lon: 1 },
          { type: 'node', id: 2, lat: 1, lon: 2 },
          { type: 'node', id: 3, lat: 2, lon: 2 },
          { type: 'way', id: 10, nodes: [1, 2], tags: { aeroway: 'runway', ref: '10/28' } },
          { type: 'way', id: 20, nodes: [2, 3], tags: { highway: 'service' } }
        ]
      })
    };
  };
  try {
    const selection = airportSelection({
      lat: 12.345678,
      lon: 23.456789,
      locationDetails: {
        isAirport: true,
        airportBounds: { minLat: 12.341, maxLat: 12.349, minLon: 23.452, maxLon: 23.461 }
      }
    });
    const result = await fetchMappedAirportData(selection, { timeoutMs: 5000 });
    assert.ok(requestCount >= 1);
    assert.equal(maximumActive, 1);
    assert.equal(result.elements.some((element) => element.tags?.highway === 'service'), true);
    assert.equal(result.elements.some((element) => element.tags?.aeroway === 'runway'), true);
    assert.deepEqual(result.elements.filter((element) => element.type === 'node').map(({ id }) => id).sort(), [1, 2, 3]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('travelling between airports keeps only a bounded source cache',async()=>{
 const {airportSourceCacheSnapshot}=await import('../app/js/world/osm-airport-source.js');const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({elements:[{type:'node',id:1,lat:1,lon:1,tags:{aeroway:'helipad'}}]})});
 try{for(let i=0;i<5;i++)await fetchMappedAirportData({lat:20+i,lon:30,name:'Test Airport',locationDetails:{isAirport:true,airportBounds:{minLat:20+i-.001,maxLat:20+i+.001,minLon:29.999,maxLon:30.001}}});const s=airportSourceCacheSnapshot();assert.ok(s.entries<=s.entryLimit&&s.entries<=2);assert.ok(s.elements<=s.elementLimit);}finally{globalThis.fetch=previous;}
});

test('subdividing dense map responses shares one total request budget', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    const [left, bottom, right, top] = new URL(url).searchParams.get('bbox').split(',').map(Number);
    return top-bottom > .007 || right-left > .007
      ? {ok:false,status:400,text:async()=> 'Too many nodes'}
      : {ok:true,status:200,json:async()=>({elements:[]})};
  };
  try {
    await assert.rejects(fetchMappedAirportData({lat:30,lon:40,name:'Budget Airport'}), /request count exhausted/);
    assert.equal(calls, MAX_CELL_REQUESTS);
  } finally { globalThis.fetch = previous; }
});

test('oversized source intake fails before partial airport publication or caching', async () => {
  const {MAX_SOURCE_ELEMENTS,airportSourceCacheSnapshot} = await import('../app/js/world/osm-airport-source.js');
  const previous = globalThis.fetch, before = airportSourceCacheSnapshot();
  let calls = 0;
  const elements = Array.from({length:60001},(_,id)=>({type:'node',id,lat:1,lon:1}));
  globalThis.fetch = async () => {calls++;return {ok:true,status:200,json:async()=>({elements})};};
  try {
    await assert.rejects(fetchMappedAirportData({lat:31,lon:41,name:'Large Airport'}), /source size/);
    assert.equal(calls, Math.ceil(MAX_SOURCE_ELEMENTS / elements.length));
    assert.deepEqual(airportSourceCacheSnapshot(), before);
  } finally { globalThis.fetch = previous; }
});
