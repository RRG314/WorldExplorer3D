import test from 'node:test';import assert from 'node:assert/strict';
import {createRlpGroundMosaic} from '../scripts/lib/rlp-ground-mosaic.mjs';
import {nativeRasterMetadata} from '../scripts/lib/bare-earth-raster.mjs';
import {createGroundBuildPlan,createGroundGridPatch} from '../scripts/lib/ground-artifact-builder.mjs';
const tile=(eastingKm,northingKm)=>({eastingKm,northingKm});
function raster(source){
 const data=new Float32Array(1000000);
 for(let row=0;row<1000;row++)for(let column=0;column<1000;column++)data[row*1000+column]=(source.eastingKm*1000+column+.5)/4+(source.northingKm*1000+999-row+.5)/2;
 return {width:1000,height:1000,origin:[source.eastingKm*1000,(source.northingKm+1)*1000],resolution:[1,-1],nodata:-9999,data};
}
function row(points){const bytes=new ArrayBuffer(points.length*24),view=new DataView(bytes);points.forEach(([e,n,h=0],i)=>{view.setFloat64(i*24,e,true);view.setFloat64(i*24+8,n,true);view.setFloat64(i*24+16,h,true);});return view;}
test('native RLP metadata requires its real horizontal and vertical CRS; wrong datums and point grids reject',()=>{
 const image={getGeoKeys:()=>({ProjectedCSTypeGeoKey:25832,VerticalCSTypeGeoKey:7837,GTRasterTypeGeoKey:1}),fileDirectory:{getValue:()=>null},getOrigin:()=>[355000,5581000],getResolution:()=>[1,-1],getWidth:()=>1000,getHeight:()=>1000,getGDALNoData:()=>-9999};
 assert.deepEqual(nativeRasterMetadata(image,{horizontalEpsg:25832,verticalEpsg:7837}).origin,[355000,5581000]);
 assert.throws(()=>nativeRasterMetadata(image,{horizontalEpsg:27700,verticalEpsg:7837}),/crs_or_grid/);
 assert.throws(()=>nativeRasterMetadata(image,{horizontalEpsg:25832,verticalEpsg:5709}),/crs_or_grid/);
 assert.throws(()=>nativeRasterMetadata({...image,getGeoKeys:()=>({...image.getGeoKeys(),GTRasterTypeGeoKey:2})},{horizontalEpsg:25832}),/crs_or_grid/);
});
test('bilinear sampling remains continuous across two-file seams and four-file corners without copying border pixels',async()=>{
 const mosaic=createRlpGroundMosaic({tiles:[tile(0,0),tile(1,0),tile(0,1),tile(1,1)],loadTile:async source=>raster(source)});
 const points=[[999.75,550],[1000,550],[1000.25,550],[1000,1000],[1000.1,999.9]];
 await mosaic.prepareRow(row(points),{count:points.length});
 for(const [e,n] of points)assert.ok(Math.abs(mosaic.sample(e,n)-(e/4+n/2))<1e-8);
 assert.equal(mosaic.stats.loads,4);mosaic.dispose();assert.equal(mosaic.snapshot().residentTiles,0);
});
test('exact pixel centres ignore unused neighbours, while missing contributing pixels and absent files never become zero or edge fill',async()=>{
 const data=raster(tile(0,0));data.data[998*1000+1]=-9999;
 const mosaic=createRlpGroundMosaic({tiles:[tile(0,0)],loadTile:async()=>data});
 await mosaic.prepareRow(row([[.5,.5],[1,1]]),{count:2});assert.equal(mosaic.sample(.5,.5),.375);
 assert.throws(()=>mosaic.sample(1,1),/missing_source_pixel/);
 await assert.rejects(mosaic.prepareRow(row([[1000,500]]),{count:1}),/missing_tile/);
 assert.throws(()=>mosaic.sample(1000,500),/unprepared_tile/);mosaic.dispose();
});
test('row preparation respects its decoded-memory budget, reuses resident source tiles and rejects impossible requests before loading',async()=>{
 let loads=0;const mosaic=createRlpGroundMosaic({tiles:[tile(0,0),tile(1,0),tile(2,0)],maxResidentTiles:1,loadTile:async s=>{loads++;return raster(s);}});
 for(const e of [10,20,1010,1020,2010]){await mosaic.prepareRow(row([[e,20]]),{count:1});assert.equal(mosaic.sample(e,20),e/4+10);assert.equal(mosaic.snapshot().residentTiles,1);}
 assert.equal(loads,3);assert.equal(mosaic.snapshot().decodedHeightBytes,4000000);
 await assert.rejects(mosaic.prepareRow(row([[1000,20]]),{count:1}),/exceeds_cache/);assert.equal(loads,3);mosaic.dispose();
});
test('a moved or malformed native tile rejects, and late decoding cannot repopulate a disposed compilation cache',async()=>{
 const wrong=createRlpGroundMosaic({tiles:[tile(0,0)],loadTile:async()=>({...raster(tile(0,0)),origin:[1,1000]})});
 await assert.rejects(wrong.prepareRow(row([[20,20]]),{count:1}),/grid_mismatch/);wrong.dispose();
 let release;const mosaic=createRlpGroundMosaic({tiles:[tile(0,0)],loadTile:()=>new Promise(resolve=>release=resolve)});
 const pending=mosaic.prepareRow(row([[20,20]]),{count:1});mosaic.dispose();release(raster(tile(0,0)));
 await assert.rejects(pending,/disposed/);assert.equal(mosaic.snapshot().residentTiles,0);assert.throws(()=>mosaic.sample(20,20),/disposed/);
});
test('compact patch plans use the existing global grid without allocating per-point objects or changing legacy planning',()=>{
 const options={districtId:'source',centerLatitude:52,centerLongitude:-1,widthMeters:20,heightMeters:20,spacingMeters:5};
 const ordinary=createGroundBuildPlan(options),compact=createGroundBuildPlan({...options,includePoints:false});
 assert.ok(ordinary.parts[0].points.length>1);assert.equal(compact.parts[0].points.length,0);
 assert.deepEqual(compact.parts[0].grid,ordinary.parts[0].grid);assert.deepEqual(compact.parts[0].coverage,ordinary.parts[0].coverage);
 const grid=ordinary.parts[0].grid,patch=createGroundGridPatch({id:'source',westMeters:grid.minColumn*5,eastMeters:grid.maxColumn*5,southMeters:grid.minRow*5,northMeters:grid.maxRow*5,spacingMeters:5});
 assert.deepEqual(patch.grid,grid);assert.deepEqual(patch.coverage,ordinary.parts[0].coverage);assert.equal(patch.points.length,0);
 assert.throws(()=>createGroundGridPatch({id:'oversized',westMeters:0,eastMeters:100000,southMeters:0,northMeters:100000,spacingMeters:1}),/maximum/);
 assert.throws(()=>createGroundGridPatch({id:'bad',westMeters:10,eastMeters:0,southMeters:0,northMeters:10,spacingMeters:1}),/invalid_ground_patch/);
});
