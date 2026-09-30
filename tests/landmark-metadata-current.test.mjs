import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {landmarkBuildingMetadata} from '../app/js/world/landmark-source.js';
import {mergeBuildingMetadata} from '../app/js/world/building-metadata.js';

test('reviewed wall tower identity enriches its footprint without touching adjacent buildings',()=>{
 const pack=JSON.parse(fs.readFileSync(new URL('../app/data/featured-landmarks.json',import.meta.url))).packs.find(p=>p.id==='great-wall-mutianyu');
 const metadata=landmarkBuildingMetadata({...pack,_landmarkPackId:pack.id});
 const tower=metadata.elements.find(e=>e.id===488125773);
 assert.equal(tower.tags._landmarkRole,'fortification_tower');
 const nodeIds=new Set(tower.nodes);
 const nodes=pack.elements.filter(e=>e.type==='node'&&nodeIds.has(e.id));
 const footprint={...tower,id:'geometry-tower',tags:{building:'yes',_sourceFeatureId:'overture:reviewed-tower'}};
 const neighbor={...tower,id:'neighbor',tags:{building:'yes',_sourceFeatureId:'overture:neighbor'},nodes:tower.nodes.map(n=>n+100000000000)};
 const adjacent=nodes.map(n=>({...n,id:n.id+100000000000,lon:n.lon+.001}));
 const data={elements:[...nodes,...adjacent,footprint,neighbor]};
 mergeBuildingMetadata(data,metadata,{lat:pack.center.lat,lon:pack.center.lon});
 assert.equal(footprint.tags._buildingMetadataSourceId,'osm:way:488125773');
 assert.equal(footprint.tags._landmarkRole,'fortification_tower');
 assert.equal(neighbor.tags._landmarkRole,undefined);
 assert.equal(footprint.tags._sourceFeatureId,'overture:reviewed-tower');
});

import {applyHistoricWallBuildingRoles} from '../app/js/world/historic-wall-building-role.js';
test('fortification appearance requires crossing, not mere proximity, and preserves mapped facts',()=>{
 const nodes=[{type:'node',id:1,lat:40,lon:116},{type:'node',id:2,lat:40,lon:116.0001},{type:'node',id:3,lat:40.0001,lon:116.0001},{type:'node',id:4,lat:40.0001,lon:116}];
 const way={type:'way',id:9,nodes:[1,2,3,4,1],tags:{building:'yes',height:'9'}};
 const walls={elements:[{type:'node',id:10,lat:39.9999,lon:116.00005},{type:'node',id:11,lat:40.0002,lon:116.00005},{type:'way',id:12,nodes:[10,11],tags:{historic:'citywalls'}}]};
 const data={elements:[...nodes,way]};
 assert.equal(applyHistoricWallBuildingRoles(data,walls),1);
 assert.equal(way.tags.height,'9');assert.equal(way.tags.historic,undefined);
 assert.equal(way.tags._landmarkRole,'fortification_tower');
 delete way.tags._landmarkRole;
 walls.elements[0].lon=walls.elements[1].lon=116.0002;
 assert.equal(applyHistoricWallBuildingRoles(data,walls),0);
 assert.equal(way.tags._landmarkRole,undefined);
});
