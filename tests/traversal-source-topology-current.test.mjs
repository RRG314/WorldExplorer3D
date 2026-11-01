import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ctx} from '../app/js/shared-context.js?v=55';
import {initWorldTraversal,invalidateTraversalNetworks,buildTraversalNetworks} from '../app/js/world/traversal.js';
import {materializeTraversalSegments} from '../app/js/world/traversal-graph-storage.js';
import {compileTransportNetworkModel} from '../app/js/world/compiler/transport-network-model.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';

const source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/silverstone/source.json',import.meta.url)));
const frame=earthCoordinateFrame({lat:52.0713,lon:-1.0168},100000);
function road(id,pts,nodeIds,mode='at_grade'){
 return {sourceFeatureId:`osm:way:${id}`,type:'raceway',networkKind:'road',pts,width:12,metersPerWorldUnit:1.11,driveable:true,
  sourceTopologyNodes:pts.map((p,i)=>({id:String(nodeIds[i]),...p})),sourceNodeIds:nodeIds.map(String),
  structureSemantics:{terrainMode:mode,verticalOrder:mode==='elevated'?1:0},
  transportRecord:{identity:`osm:way:${id}`,completeness:'lossless',routeState:'complete',safeForDriving:true,direction:'forward'}};
}
function graph(features){
 initWorldTraversal({runtimeRoadFeatures:()=>features,isVehicleRoad:()=>true,enableLinearFeatures:()=>false,
  featureTraversalKey:f=>`${f.structureSemantics?.terrainMode}:${f.structureSemantics?.verticalOrder||0}`});
 ctx.linearFeatures=[];ctx.transportNetworkModel=compileTransportNetworkModel(features);invalidateTraversalNetworks();
 return buildTraversalNetworks().drive;
}
test('retained distinct source nodes survive the navigation proximity grid; unspecified geometry retains legacy behavior',()=>{
 const pts=[{x:0,z:0},{x:.452,z:0},{x:8,z:0}],r=road(1,pts,[1,2,3]);
 let g=graph([r]);assert.equal(g.nodeCount,3);assert.equal(g.segmentCount,2);
 const first=materializeTraversalSegments(g.segments)[0];assert.equal(first.p1,pts[0]);assert.equal(first.p2,pts[1]);
 const legacy={...road(2,pts,[4,5,6]),transportRecord:{completeness:'generalized'}};
 g=graph([legacy]);assert.equal(g.nodeCount,2);assert.equal(g.segmentCount,1);
});
test('all incident transport-pair identities resolve to one shared physical junction',()=>{
 const a=road(1,[{x:-20,z:0},{x:0,z:0}],[1,2]);
 const b=road(2,[{x:0,z:0},{x:20,z:0}],[2,3]);
 const c=road(3,[{x:0,z:0},{x:0,z:20}],[2,4]);
 const g=graph([a,b,c]),rows=materializeTraversalSegments(g.segments);
 assert.equal(rows.length,3);assert.equal(rows[0].toId,rows[1].fromId);assert.equal(rows[1].fromId,rows[2].fromId);assert.equal(g.nodeCount,4);
});
test('nearby distinct mapped roads and vertically separate decks do not gain proximity connections',()=>{
 const a=road(1,[{x:0,z:0},{x:10,z:0}],[1,2]);
 const b=road(2,[{x:0,z:1},{x:10,z:1}],[3,4]);
 const deck=road(3,[{x:-10,z:0},{x:20,z:0}],[5,6],'elevated');
 for(const f of [a,b,deck])f.transportSurfaceModel={distances:[0,10],centerHeights:f===deck?[12,12]:[0,0]};
 const g=graph([a,b,deck]),rows=materializeTraversalSegments(g.segments);
 assert.equal(g.nodeCount,6);assert.equal(new Set(rows.flatMap(r=>[r.fromId,r.toId])).size,6);
});
test('the actual complete Silverstone source passes through transport and navigation owners without losing any GP link',()=>{
 const features=source.ways.map(w=>road(w.id,w.geometry.map(p=>frame.toWorld(p.lat,p.lon)),w.nodes));
 const g=graph(features),ids=new Set(source.layout.wayIds.map(id=>`osm:way:${id}`));
 const selected=materializeTraversalSegments(g.segments).filter(r=>ids.has(r.feature.sourceFeatureId));
 assert.equal(selected.length,506);
 const roads=selected.map(r=>({sourceId:`${r.feature.sourceFeatureId}:${r.segIndex}:${r.sourceTStart.toFixed(6)}:${r.sourceTEnd.toFixed(6)}`,
  sourceFeatureId:r.feature.sourceFeatureId,a:{...r.p1,y:0,connectionLayer:`source-node:${r.fromId}`},b:{...r.p2,y:0,connectionLayer:`source-node:${r.toId}`},
  widthMeters:12,direction:r.direction,driveable:true,supported:true,structure:'surface'}));
 const district={locationId:'silverstone',locationLabel:'Silverstone',anchor:{lat:52.0713,lon:-1.0168},metersPerUnit:1.11,roads};
 const result=buildVenueRaceCourses(district,{id:source.venueId,name:'Silverstone',status:'source-prepared',sourceFeatureIds:source.layout.wayIds.map(id=>`osm:way:${id}`),mappedLengthMeters:5880.622911204611});
 assert.equal(result.events[0].sourcePath.length,506);assert.ok(result.events[0].lengthMeters>5800);
});

function exactSplitFixture(completeness='lossless'){
 const feature=road(1,[{x:-100,z:0},{x:0,z:0},{x:100,z:0}],[1,2,3]);feature.transportRecord={...feature.transportRecord,completeness};
 feature.transportGraphRef={direction:'forward',driveable:true,stations:[{nodeId:'controlled-certified-junction',connectionKind:'endpoint-interior',
  distanceAlong:100.0243,segmentIndex:1,segmentT:.000243,point:{x:.0243,z:0}}]};
 initWorldTraversal({runtimeRoadFeatures:()=>[feature],isVehicleRoad:()=>true,enableLinearFeatures:()=>false,featureTraversalKey:()=> 'ground'});
 ctx.linearFeatures=[];ctx.transportNetworkModel={id:'controlled-certified-junctions'};invalidateTraversalNetworks();
 return materializeTraversalSegments(buildTraversalNetworks().drive.segments);
}
test('a certified junction split preserves the centimetre span next to a retained source node',()=>{
 const rows=exactSplitFixture();assert.equal(rows.length,3);assert.equal(rows[0].toId,rows[1].fromId);assert.equal(rows[1].toId,rows[2].fromId);
 assert.ok(rows[1].length<.05);assert.ok(rows[1].length*rows[1].feature.metersPerWorldUnit>=.01);
 assert.equal(rows[1].sourceTStart,0);assert.ok(rows[1].sourceTEnd>0&&rows[1].sourceTEnd<.001);
});
test('generalized source retains its existing proximity and minimum-span behavior',()=>{
 assert.equal(exactSplitFixture('generalized').length,2);
});
