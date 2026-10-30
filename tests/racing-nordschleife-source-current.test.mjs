import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {compileMappedVenueLayout,geographicVenueDistance} from '../app/js/racing/venue-layout.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {normalizeRaceRouteReference} from '../app/js/racing/course-library.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
const text=fs.readFileSync(new URL('../app/assets/racing/nordschleife/source.json',import.meta.url),'utf8'),source=JSON.parse(text);
test('the complete independently sourced Nordschleife keeps T13, all original spans, five bridge identities and its measured length',()=>{
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),'0fcd281250a971a66b795850d1657541b475cba5e3ac249e21a3a0439d3a5d26');
 const layout=compileMappedVenueLayout(source);
 assert.equal(layout.wayIds.length,53);assert.equal(layout.points.length-1,1067);
 assert.ok(Math.abs(layout.lengthMeters-20746.16090757472)<.001);assert.equal(layout.referenceLengthMeters,20832);
 assert.equal(layout.ways.get(layout.wayIds[0]).tags.name,'T13');
 assert.equal(layout.wayIds.filter(id=>layout.ways.get(id).tags.bridge==='yes').length,5);
 assert.ok(source.ways.every(w=>!Object.hasOwn(w,'uid')&&!Object.hasOwn(w,'user')));
 assert.ok(layout.points.some((p,i)=>i&&geographicVenueDistance(layout.points[i-1],p)<.5),'retain the real sub-half-metre source span');
 const missing=structuredClone(source);missing.layout.wayIds.shift();assert.throws(()=>compileMappedVenueLayout(missing),/not_closed/);
});
test('the graph and saved reference preserve every Nordschleife span while physical long-venue admission remains closed',()=>{
 // Topology-only fixture, explicitly not a terrain or playable-course survey.
 const layout=compileMappedVenueLayout(source),frame=earthCoordinateFrame({lat:50.359,lon:6.963},100000),roads=[];
 for(const id of layout.wayIds){const way=layout.ways.get(id);for(let i=0;i<way.nodes.length-1;i++)roads.push({sourceId:`osm:way:${id}:${i}`,
  a:{...frame.toWorld(way.geometry[i].lat,way.geometry[i].lon),y:0,connectionLayer:'source-node:'+way.nodes[i]},
  b:{...frame.toWorld(way.geometry[i+1].lat,way.geometry[i+1].lon),y:0,connectionLayer:'source-node:'+way.nodes[i+1]},
  widthMeters:7,direction:'forward',structure:way.tags.bridge==='yes'?'bridge':'surface',supported:true,driveable:true});}
 const graph=buildRaceRoadGraph(roads,{metersPerUnit:1.11}),path=roads.map(r=>r.sourceId+':forward');
 assert.equal(graph.edges.length,1067,'short real source links cannot disappear during graph construction');
 assert.equal(normalizeRaceRouteReference({version:1,districtFingerprint:'race-district:'+'a'.repeat(64),path,discipline:'circuit',laps:1,participants:4}).path.length,1067);
 const reference={version:1,districtFingerprint:'race-district:'+'a'.repeat(64),path:Array(2048).fill(path[0]),discipline:'circuit',laps:1,participants:4};
 assert.equal(normalizeRaceRouteReference(reference).path.length,2048);
 assert.throws(()=>normalizeRaceRouteReference({...reference,path:[...reference.path,path[0]]}),/invalid_saved/);
 assert.throws(()=>createRaceCourse(graph,path,{locationId:'topology-only',anchor:{lat:50.359,lon:6.963},discipline:'circuit'}),/race_route_length/);
 assert.equal(RACING_VENUE_SOURCES.find(pack=>pack.id===source.venueId).raceAdmission,'practice');
 assert.equal(RACING_VENUE_SOURCES.find(pack=>pack.id===source.venueId).presentationStatus,'under-construction','source topology alone cannot finish venue presentation');
});
test('both OSM pit-lane spellings are excluded from a reviewed main-course layout',()=>{
 for(const spelling of ['pitlane','pit_lane']){const changed=structuredClone(source);changed.ways.find(w=>w.id===changed.layout.wayIds[0]).tags.raceway=spelling;
  assert.throws(()=>compileMappedVenueLayout(changed),/layout_way_invalid/);}
});
