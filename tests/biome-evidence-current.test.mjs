import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBiomeProfile} from '../app/js/earth-core/biome-profile.js';
import {worldCoverStatsForLocation,refreshWorldBiomeFromWorldCoverStats} from '../app/js/terrain/worldcover-biome-state.js';
import {terrainSurfaceClassForWorldCover,terrainSurfaceMixForClass,TERRAIN_SURFACE_CLASS} from '../app/js/terrain/surface-material-blend.js';

test('missing vegetation data and bare terrain do not invent hot sandy deserts',()=>{
 for(const latitude of [-33,-20,18,30,45]) {
  assert.notEqual(classifyBiomeProfile({latitude}).id,'hot-desert');
  const cover=terrainSurfaceClassForWorldCover('bare',latitude);
  assert.equal(cover,TERRAIN_SURFACE_CLASS.bare);
  const mixture=terrainSurfaceMixForClass(cover);
  assert.equal(mixture.mixA[1],0,'unobserved dunes');
  assert.equal(mixture.mixA[3]+mixture.mixB[0],1);
 }
 assert.equal(classifyBiomeProfile({latitude:43,signals:{arid:.8,vegetated:.05}}).id,'arid-mosaic');
 assert.equal(classifyBiomeProfile({latitude:23,elevationMeters:120,signals:{arid:.8,vegetated:.05}}).id,'hot-desert');
 assert.equal(classifyBiomeProfile({latitude:28,reliefMeters:900,signals:{arid:.5,vegetated:.1}}).id,'montane-mosaic');
});

test('mapped herbaceous wetlands remain distinct from open water and woodland',()=>{
 const biome=classifyBiomeProfile({latitude:25.45,elevationMeters:1,signals:{woody:0,vegetated:1,wetland:.9,water:0}});
 assert.equal(biome.id,'wetland');assert.equal(biome.vegetationModel,'low-vegetation');
 assert.equal(biome.hydrologyPolicy,'mapped-water-only');
});

test('known non-tree vegetation cannot become a closed forest',()=>{
 for(const latitude of [5,39]) {
  const biome=classifyBiomeProfile({latitude,signals:{woody:0,vegetated:.8,water:.1}});
  assert.ok(!biome.id.includes('forest'));
 }
 assert.equal(classifyBiomeProfile({latitude:5,signals:{woody:.8,vegetated:.8,water:.1}}).id,'tropical-rainforest');
});
test('mountain snow does not turn a temperate location into the polar region',()=>{
 assert.equal(classifyBiomeProfile({latitude:37,elevationMeters:3400,signals:{cryo:.1}}).id,'alpine');
 assert.equal(classifyBiomeProfile({latitude:75,signals:{cryo:.8}}).id,'polar-cryosphere');
});
test('river pixels do not erase the wooded character of adjacent land',()=>{
 const ctx={LOC:{lat:-3,lon:-60},worldSurfaceProfile:{}};
 const stats=worldCoverStatsForLocation(ctx);
 refreshWorldBiomeFromWorldCoverStats(ctx,stats,{key:'river',bounds:{latS:-3.1,latN:-2.9,lonW:-60.1,lonE:-59.9},counts:{water:75,tree:20,grass:5},elevationMeters:20});
 assert.equal(ctx.worldSurfaceProfile.biomeEvidence.signals.woody,.8);
 assert.equal(ctx.worldSurfaceProfile.biome.id,'tropical-rainforest');
});
test('same accepted tiles give same local biome in either completion order',()=>{
 const near={key:'near',bounds:{latS:38,latN:40,lonW:-77,lonE:-75},counts:{crop:80,water:20},elevationMeters:100};
 const far={key:'far',bounds:{latS:45,latN:46,lonW:-77,lonE:-75},counts:{tree:90,water:10},elevationMeters:100};
 for(const order of [[near,far],[far,near]]) {
  const ctx={LOC:{lat:39,lon:-76},worldSurfaceProfile:{}};
  const stats=worldCoverStatsForLocation(ctx);
  order.forEach(tile=>refreshWorldBiomeFromWorldCoverStats(ctx,stats,tile));
  assert.equal(ctx.worldSurfaceProfile.biomeEvidence.tileKey,'near');
  assert.notEqual(ctx.worldSurfaceProfile.biome.id,'temperate-forest');
  ctx.LOC={lat:10,lon:10};
  assert.equal(refreshWorldBiomeFromWorldCoverStats(ctx,stats,far),null);
 }
});

test('unmapped subtropical locations do not acquire sand from latitude alone',async()=>{
 const {classifyWorldSurfaceProfile}=await import('../app/js/surface-rules.js');
 for(const lat of [-30,-18,18,23,30,34]){
  assert.notEqual(classifyWorldSurfaceProfile({centerLat:lat}).terrainModeHint,'sand');
  assert.equal(classifyWorldSurfaceProfile({centerLat:lat,landuseWays:[{tags:{natural:'bare_rock'}}]}).terrainModeHint,'rock');
  assert.equal(classifyWorldSurfaceProfile({centerLat:lat,landuseWays:[{tags:{natural:'sand'}}]}).terrainModeHint,'sand');
 }
});
