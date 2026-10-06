import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {
  clearTerrainTileCache, elevationMetersAtLatLon, elevationWorldYAtWorldXZ,
  getOrLoadTerrainTile, latLonToTileXY, pruneTerrainTileCache,
  terrainSourceSampleAtLatLon, terrainSourceSampleAtWorldXZ,
  terrainTileCacheSnapshot, waitForTerrainReadyBounds, waitForTerrainTileReadyAtZoom
} from '../app/js/terrain/tiles.js';

let images;
function setup() {
  images = [];
  globalThis.Image = class {
    constructor() {images.push(this);}
    set src(value) {this.url = value;}
  };
  Object.assign(ctx, {terrainTileCache:new Map(),terrainGroup:{children:[]},
    TERRAIN_ZOOM:15,TERRAIN_TILE_URL:(z,x,y)=>`https://example.invalid/${z}/${x}/${y}`,
    WORLD_UNITS_PER_METER:1,TERRAIN_Y_EXAGGERATION:1,
    worldToGeo:(x,z)=>({lat:39+z/1000,lon:-76+x/1000})});
  clearTerrainTileCache();
}

test('arbitrary ordinary height queries and post-exit reads cannot create DEM requests', () => {
  setup();
  for(let i=0;i<2000;i++) {
    assert.equal(elevationMetersAtLatLon(38+i/10000,-78+i/10000),null);
    assert.equal(elevationWorldYAtWorldXZ(i,0),null);
    assert.equal(terrainSourceSampleAtLatLon(39,-76+i/10000).status,'pending');
    assert.equal(terrainSourceSampleAtWorldXZ(i,0).status,'pending');
  }
  assert.equal(images.length,0);
  assert.equal(terrainTileCacheSnapshot().entries,0);
  const point=latLonToTileXY(39,-76,15);
  const tile=getOrLoadTerrainTile(15,point.x,point.y);
  tile.loaded=true;tile.loading=false;tile.elev=new Float32Array(256*256).fill(123);
  assert.equal(elevationMetersAtLatLon(39,-76),123);
  assert.equal(terrainSourceSampleAtWorldXZ(0,0).elevationMeters,123);
  assert.equal(images.length,1);
  clearTerrainTileCache();
  assert.equal(terrainSourceSampleAtWorldXZ(0,0).status,'pending');
  assert.equal(images.length,1);
  assert.equal(terrainTileCacheSnapshot().entries,0);
});

test('pending source requests have an absolute budget and teardown cancels every admitted image',()=>{
  setup();
  const limit=terrainTileCacheSnapshot().requestLimit;
  for(let x=0;x<limit+100;x++)getOrLoadTerrainTile(15,x,200);
  assert.equal(images.length,limit);
  assert.equal(terrainTileCacheSnapshot().pending,limit);
  const refused=getOrLoadTerrainTile(15,limit+200,200);
  assert.equal(refused.failed,true);assert.match(refused.lastError,/working set/);
  clearTerrainTileCache();
  assert.ok(images.every(image=>image.url==='' && image.onload===null && image.onerror===null));
  assert.equal(terrainTileCacheSnapshot().entries,0);
});

test('readiness waits from a retired cache generation cannot recreate its requests',async()=>{
  setup();
  const wait=waitForTerrainTileReadyAtZoom(15,12,14,1000);
  assert.equal(images.length,1);
  clearTerrainTileCache();
  assert.equal(await wait,false);
  assert.equal(images.length,1);
  assert.equal(terrainTileCacheSnapshot().entries,0);
});

test('district readiness rejects oversized windows and bounds concurrent work before cancellation',async()=>{
  setup();
  assert.equal(await waitForTerrainReadyBounds({latN:40,latS:38,lonW:-78,lonE:-74},1000),false);
  assert.equal(images.length,0);
  const wait=waitForTerrainReadyBounds({latN:39.03,latS:39,lonW:-76.03,lonE:-76},1000);
  assert.equal(images.length,8);
  clearTerrainTileCache();
  assert.equal(await wait,false);
  assert.equal(images.length,8);
  assert.equal(terrainTileCacheSnapshot().entries,0);
});

test('post-compilation pruning retains detailed mesh sources and their shared east/south edges',()=>{
  setup();
  const protectedKeys=[];
  for(let x=10;x<18;x++)for(let y=10;y<18;y++){
    const tile=getOrLoadTerrainTile(15,x,y);tile.loaded=true;tile.loading=false;
    protectedKeys.push(tile.key);
    if(x<17&&y<17)ctx.terrainGroup.children.push({userData:{terrainTileKey:tile.key,terrainTile:{z:15,tx:x,ty:y}}});
  }
  for(let x=100;x<181;x++){
    const tile=getOrLoadTerrainTile(12,x,200);tile.loaded=true;tile.loading=false;
  }
  const snapshot=pruneTerrainTileCache();
  assert.equal(snapshot.entries,snapshot.limit);
  assert.ok(protectedKeys.every(key=>ctx.terrainTileCache.has(key)));
  clearTerrainTileCache();
});

 test('an old retry abort cannot cancel the same tile requested by the replacement generation',async()=>{
  setup();
  const old=getOrLoadTerrainTile(15,12,14);old.img.onerror();
  const signal=new AbortController();
  const wait=waitForTerrainTileReadyAtZoom(15,12,14,1000,{}, {signal:signal.signal});
  clearTerrainTileCache();
  const next=getOrLoadTerrainTile(15,12,14);
  signal.abort();
  assert.equal(await wait,false);
  assert.equal(next.loading,true);
  assert.equal(next.evicted,false);
  assert.equal(ctx.terrainTileCache.get(next.key),next);
  clearTerrainTileCache();
});
