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

function reviewedTransitionGraph({heightGap=0,xGap=0,sourceMismatch=false,phase='accepted',foreign=false}={}){
 const a=road(1,[{x:-100,z:0},{x:0,z:0}],[10,20]),b=road(2,[{x:xGap,z:0},{x:100,z:0}],[sourceMismatch?21:20,30],'elevated'),
  c=road(3,[{x:100,z:0},{x:200,z:0}],[30,40]),features=[a,b,c],venueSource=Object.freeze({id:'controlled-bridge-loop',sourceSha256:'a'.repeat(64),sourceFeatureIds:Object.freeze(features.map(f=>f.sourceFeatureId))});
 for(const f of features){
  f.originalSourceNodeIds=[...f.sourceNodeIds];f.surfaceSurveyEvidence={venueSource};
  f.transportSurfaceModel={distances:new Float32Array([0,100]),centerHeights:[f===b?heightGap:0,0],leftHeights:[0,0],rightHeights:[0,0],width:12,maximumReviewedCrossfall:0,
   reviewedSurfacePhase:phase,surveyedSurface:{venueSource:foreign&&f===b?{...venueSource}:venueSource,maximumCrossfall:.7}};
  // A retained transport model from before final endpoint reconciliation.
  // Finalized source surfaces must still be represented by this traversal owner.
  f.transportGraphRef={stations:[],direction:'forward',driveable:true};
 }
 initWorldTraversal({runtimeRoadFeatures:()=>features,isVehicleRoad:()=>true,enableLinearFeatures:()=>false,
  featureTraversalKey:f=>`${f.structureSemantics.terrainMode}:${f.structureSemantics.verticalOrder||0}`});
 ctx.linearFeatures=[];ctx.transportNetworkModel=null;invalidateTraversalNetworks();
 return materializeTraversalSegments(buildTraversalNetworks().drive.segments);
}

test('final reviewed bridge endpoints retain explicit source-node continuity across traversal layers',()=>{
 const rows=reviewedTransitionGraph();assert.equal(rows.length,3);
 assert.equal(rows[0].toId,rows[1].fromId);assert.equal(rows[1].toId,rows[2].fromId);
});
test('reviewed endpoint continuity never joins mismatched source nodes, unfinalized or foreign surveys, different heights or nearby geometry',()=>{
 for(const options of [{heightGap:2},{xGap:.1},{sourceMismatch:true},{phase:'preparation'},{foreign:true}]){
  const rows=reviewedTransitionGraph(options);assert.notEqual(rows[0].toId,rows[1].fromId,JSON.stringify(options));
 }
});
