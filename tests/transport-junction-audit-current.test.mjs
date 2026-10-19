import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTransportJunctionContinuity} from '../app/js/world/compiler/transport-junction-profile.js';
import {compileTransportNetworkModel} from '../app/js/world/compiler/transport-network-model.js';

function fixture(completeness='generalized') {
 const features=[0,1].map(i=>({sourceFeatureId:`road-${i}`,transportGraphRef:{featureId:`road-${i}`},
  transportRecord:{completeness,routeState:'complete'},structureSemantics:{terrainMode:i?'at_grade':'subgrade'},height:i?30.53:21.64}));
 const side=i=>({featureId:`road-${i}`,point:{x:0,z:0},segmentIndex:0,segmentT:i?0:1});
 const network={connections:[{id:'portal',left:side(0),right:side(1)}]};
 return {features,network,audit:()=>auditTransportJunctionContinuity(features,network,f=>f.height)};
}
test('fallback tunnel joins cannot bypass physical continuity acceptance',()=>{
 const f=fixture(),result=f.audit();
 assert.equal(result.authoritativeConnectionCount,0);
 assert.equal(result.auditedConnectionCount,1);assert.equal(result.generalizedConnectionCount,1);
 assert.equal(result.sampledConnectionCount,1);assert.equal(result.discontinuityCount,1);
 assert.ok(Math.abs(result.maximumVerticalDeltaMeters-8.89)<1e-8);
 assert.equal(result.discontinuities[0].sourceCompleteness,'generalized');
 f.features[0].height=30.53;assert.equal(f.audit().discontinuityCount,0);
});
test('exact source identity and unavailable contact remain distinguishable',()=>{
 const f=fixture('lossless');assert.equal(f.audit().authoritativeConnectionCount,1);
 f.features[0].height=NaN;const missing=f.audit();
 assert.equal(missing.auditedConnectionCount,1);assert.equal(missing.sampledConnectionCount,0);
 // A consumer must require sampled === audited as well as no discontinuities.
 assert.equal(missing.generalizedConnectionCount,0);
});

test('modeled approaches require a finite complete owner in the connected physical corridor',()=>{
 const f=fixture();
 f.features[1].transportSurfaceModel={engineeredApproach:true};
 const anchor={source:'transport_graph_node',ownerFeatureId:'road-0',targetSurfaceY:21.64};
 f.features[1].structureTransitionAnchors=[anchor];
 assert.equal(f.audit().auditedVerticalAnchorCount,1);
 assert.equal(f.audit().generalizedEngineeredApproachCount,1);
 assert.equal(f.audit().invalidVerticalAnchorCount,0);
 f.features[0].transportRecord.completeness='lossless';
 assert.equal(f.audit().invalidVerticalAnchorCount,0,'source fidelity is not a separate height system');
 const connection=f.network.connections.pop();
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'unconnected_vertical_owner');
 f.network.connections.push(connection);
 f.features[0].transportRecord.completeness='generalized';
 f.features[0].transportRecord.routeState='incomplete';
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'incomplete_vertical_owner');
 f.features[0].transportRecord.routeState='complete';
 anchor.targetSurfaceY=NaN;
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'nonfinite_vertical_target');
 anchor.targetSurfaceY=21.64;anchor.ownerFeatureId='retired-road';
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'missing_vertical_owner');
 f.features[1].structureTransitionAnchors=[];
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'engineered_approach_without_graph_anchor');
 const disconnected=auditTransportJunctionContinuity(f.features,null,()=>0);
 assert.equal(disconnected.invalidVerticalAnchorCount,1,'no network cannot hide orphaned approaches');
});

test('same-provider but disconnected roads cannot authorize a vertical constraint',()=>{
 const f=fixture();
 const unrelated={...f.features[0],transportGraphRef:{featureId:'unrelated'}};
 f.features.push(unrelated);
 f.features[1].structureTransitionAnchors=[{source:'transport_graph_node',ownerFeatureId:'unrelated',targetSurfaceY:10}];
 assert.equal(f.audit().invalidVerticalAnchors[0].reason,'unconnected_vertical_owner');
});

function route(id,points,mode,type='primary') {
 return {sourceFeatureId:id,pts:points.map(([x,z])=>({x,z})),type,
  structureSemantics:{terrainMode:mode,verticalOrder:mode==='subgrade'?-1:0},
  transportRecord:{completeness:'generalized',routeState:'complete',sourceTags:{highway:type}}};
}
test('internal polyline vertices cannot fabricate cross-layer portals',()=>{
 const tunnel=route('tunnel',[[-40,0],[0,0],[40,0]],'subgrade','motorway_link');
 const surface=route('surface',[[0,20],[0,0]],'at_grade','service');
 assert.equal(compileTransportNetworkModel([tunnel,surface]).connections.length,0);
 tunnel.pts.reverse();assert.equal(compileTransportNetworkModel([tunnel,surface]).connections.length,0);
 const portal=route('portal',[[40,0],[60,0]],'at_grade','motorway_link');
 assert.equal(compileTransportNetworkModel([tunnel,portal]).connections.length,1,'actual route endpoints still join');
});
test('a same-level branch keeps an interior graph station at a through-route vertex',()=>{
 const through=route('through',[[-40,0],[0,0],[40,0]],'at_grade');
 const branch=route('branch',[[0,20],[0,0]],'at_grade');
 const network=compileTransportNetworkModel([through,branch]);
 assert.equal(network.connections.length,1);
 const connection=network.connections[0];assert.equal(connection.kind,'endpoint-interior');
 const side=connection.left.featureId==='through'?connection.left:connection.right;
 assert.equal(side.endpoint,'interior');assert.equal(side.distanceAlong,40);
});

test('cross-provider endpoint tolerance cannot override an explicit at-grade level separation',()=>{
 const left=route('exact',[[-40,0],[0,0]],'at_grade');
 left.transportRecord.completeness='lossless';
 const right=route('fallback',[[.5,0],[40,0]],'at_grade');
 left.structureSemantics.verticalOrder=1;
 assert.equal(compileTransportNetworkModel([left,right]).connections.length,0);
 left.structureSemantics.verticalOrder=0;
 assert.ok(compileTransportNetworkModel([left,right]).connections.length>0,'a genuine same-level provider seam remains connected');
});

test('a side street along a graded approach cannot escape continuity auditing',()=>{
 const f=fixture();
 for(const r of f.features)r.structureSemantics.terrainMode='at_grade';
 f.features[0].transportSurfaceModel={engineeredApproach:true};
 // The approach is constrained at its start; this mapped branch is 206 m
 // further along, where its compiled profile is still below the surface road.
 f.features[0].structureTransitionAnchors=[{source:'transport_graph_node',distance:0,
  engineeredApproach:true,ownerFeatureId:'road-1',targetSurfaceY:0}];
 f.network.connections[0].left.distanceAlong=206.578;
 f.features[0].height=-.5307;f.features[1].height=2.3979;
 const result=f.audit();
 assert.equal(result.auditedConnectionCount,1);
 assert.equal(result.discontinuityCount,1);
 assert.ok(result.maximumVerticalDeltaMeters>2.9);
});
