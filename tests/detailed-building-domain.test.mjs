import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedBuildingExclusionWindow} from '../app/js/terrain/detailed-building-domain.js';
import {createRegionalBuildingCompiler} from '../app/js/terrain/regional-building-compiler.js';

test('regional scenery never republishes buildings between road coverage and building coverage',()=>{
 const ctx={plannedEarthDetailRadiusWorld:1000,worldLoadRuntimeState:{buildingVisibleRadiusWorld:3200}};
 const w=detailedBuildingExclusionWindow(ctx),origin={lat:0,lon:0},scale=100000;
 const bounds={latS:-.1,latN:.1,lonW:-.1,lonE:.1};
 const excludedBounds={latS:-w.maxZ/scale,latN:-w.minZ/scale,lonW:w.minX/scale,lonE:w.maxX/scale};
 const compiler=createRegionalBuildingCompiler({bounds,excludedBounds,detailedFrame:{origin,scale,radius:3200},tileCount:1});
 const centers=[[0,.025],[.03,.03],[0,.05]];
 const features=centers.map(([lon,lat],id)=>({id,toGeoJSON:()=>({properties:{height:8},geometry:{type:'Polygon',coordinates:[[[lon-.00005,lat-.00005],[lon+.00005,lat-.00005],[lon+.00005,lat+.00005],[lon-.00005,lat+.00005],[lon-.00005,lat-.00005]]]}})}));
 compiler.addTile({x:1,y:1,z:14,tile:{layers:{buildings:{length:features.length,feature:i=>features[i]}}}});
 const result=compiler.finish();assert.equal(result.skippedNearBuildings,1);assert.equal(result.availableBuildings,2,'The circle corners and distant scenery remain covered');
});

test('missing detailed building authority cannot remove regional coverage',()=>{
 assert.equal(detailedBuildingExclusionWindow({plannedEarthDetailRadiusWorld:4000}),null);
});
