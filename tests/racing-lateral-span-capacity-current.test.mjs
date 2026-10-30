import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublishedLateralSection,compilePublishedLateralProfiles,compilePublishedLateralSpans} from '../app/js/racing/published-lateral-profile.js';
const sections=()=>Array.from({length:19},(_,i)=>({fixed:[-4,-1.2,0,1.2,4],edgeKnots:[],points:Array.from({length:161},(_,j)=>{const offsetMeters=-4+j*.05,baseY=10+offsetMeters*.01,y=baseY+Math.max(0,.03-Math.abs(offsetMeters-(-3+i/3))*.1);return {offsetMeters,y,baseY};})}));
const at=(points,offset,field)=>{let i=1;while(i<points.length-1&&offset>points[i].offsetMeters)i++;const a=points[i-1],b=points[i];return a[field]+(b[field]-a[field])*(offset-a.offsetMeters)/(b.offsetMeters-a.offsetMeters);};
test('an over-capacity source interval can retain two bounded profiles at an existing continuous station',()=>{
 const raw=sections(),before=JSON.stringify(raw);assert.throws(()=>compilePublishedLateralProfiles(raw,1),/capacity/);
 const spans=compilePublishedLateralSpans(raw,1);assert.equal(spans.length,2);assert.equal(spans[0].first,0);assert.equal(spans[0].last,spans[1].first);assert.equal(spans[1].last,raw.length-1);
 for(const span of spans){assert.ok(span.profiles.every(p=>p.length<=32));assert.ok(span.maximumErrorMeters<=.003);}
 const a=spans[0].profiles.at(-1),b=spans[1].profiles[0];for(const p of[...a,...b])for(const field of['y','baseY'])assert.ok(Math.abs(at(a,p.offsetMeters,field)-at(b,p.offsetMeters,field))<=.0002);
 assert.equal(JSON.stringify(raw),before);
});
test('ordinary fitting stays a single span and unresolved data retains the capacity guard',()=>{
 assert.equal(compilePublishedLateralSpans(sections().slice(0,3),1).length,1);
 const bad=sections().slice(0,2);bad[0].points=bad[0].points.map((p,i)=>({...p,y:10+(i%2)*.03}));assert.throws(()=>compilePublishedLateralSpans(bad,1),/capacity/);
 const missing=sections();delete missing[0].points[0].baseY;assert.throws(()=>compilePublishedLateralSpans(missing,1),/missing_edge_base/);
});

test('common knots cannot extend a variable-width published profile beyond a narrower station',()=>{
 const raw=[[-3,15],[-4,12]].map(([minimumMeters,maximumMeters],row)=>readPublishedLateralSection({
  contacts:{crossSectionOffsets:()=>[minimumMeters,6,13.9,14,14.1,maximumMeters]},x:0,z:row,nx:1,nz:0,widthMeters:maximumMeters-minimumMeters,metersPerUnit:1,spanMeters:1.2,t:row,
  edgeKnots:[6],boundsMeters:{minimumMeters,maximumMeters},surface:x=>({y:10+x*.01+(row?0:Math.max(0,.03-Math.abs(x-14)*.3))})
 })),compiled=compilePublishedLateralProfiles(raw,1);
 assert.ok(compiled.profiles[0].some(p=>Math.abs(p.offsetMeters-14)<.001),'the wide station retains its actual extra crease');
 for(let i=0;i<raw.length;i++){assert.equal(compiled.profiles[i][0].offsetMeters,[-3,-4][i]);assert.equal(compiled.profiles[i].at(-1).offsetMeters,[15,12][i]);}
 assert.equal(compiled.profiles[0].length,compiled.profiles[1].length);assert.ok(compiled.maximumErrorMeters<=.003);
});
test('a profiled pavement fit respects both the existing crossfall and measured three-millimetre fidelity bounds',()=>{
 const offsets=[-3,-1.2,0,1.2,6,6.02,6.025,6.1,15],surface=x=>10-.6*Math.min(x,6)-.026*Math.max(0,x-6),section={fixed:[-1.2,0,1.2],edgeKnots:[-3,6,15],boundsMeters:{minimumMeters:-3,maximumMeters:15},points:offsets.map(offsetMeters=>({offsetMeters,y:surface(offsetMeters)+(offsetMeters===6.02?.0035:offsetMeters===6.025?-.0035:0)}))},before=JSON.stringify(section),fit=compilePublishedLateralProfiles([section],1),p=fit.profiles[0];
 assert.ok(fit.maximumErrorMeters<=.003);for(let i=1;i<p.length;i++)if(p[i].offsetMeters>p[i-1].offsetMeters)assert.ok(Math.abs(p[i].y-p[i-1].y)/(p[i].offsetMeters-p[i-1].offsetMeters)<=.7+1e-8);
 for(const anchor of section.fixed)assert.equal(p.find(p=>p.offsetMeters===anchor).y,surface(anchor));
 assert.equal(JSON.stringify(section),before);
 const bad=structuredClone(section);bad.points.find(p=>p.offsetMeters===6.02).y+=.03;assert.throws(()=>compilePublishedLateralProfiles([bad],1),/fidelity/,'an actual large discontinuity cannot be fitted away');
});
test('the profiled fit survives canonical coordinate rounding without steepening a valid narrow patch',async()=>{
 const {canonicalRaceDistrict}=await import('../app/js/racing/district-facts.js');
 for(const m of [1,1.11,2])for(const offset of [6.02,6.041,6.046]){
  const base=x=>(10-.6*Math.min(x,6)-.026*Math.max(0,x-6))/m,section={fixed:[-1.2,0,1.2],edgeKnots:[-3,6,15],boundsMeters:{minimumMeters:-3,maximumMeters:15},points:[-3,-1.2,0,1.2,6,offset,offset+.005,6.1,15].map(offsetMeters=>({offsetMeters,y:base(offsetMeters)+(offsetMeters===offset?.0035/m:offsetMeters===offset+.005?-.0035/m:0)}))},fit=compilePublishedLateralProfiles([section],m),row=t=>({t,y:base(0),leftY:base(-1.2),rightY:base(1.2),racingOffsetMeters:0,lateralSamples:fit.profiles[0]}),road={sourceId:'controlled',sourceFeatureId:'controlled',a:{x:0,y:base(0),z:0},b:{x:0,y:base(0),z:40},widthMeters:18,surfaceModel:'banked-road-v1',pavementModel:'profiled-road-pavement-v1',racingWidthMeters:6,heightSampleSpanMeters:1.2,heightSamples:[row(0),row(1)],structure:'surface',direction:'forward',driveable:true,supported:true},facts={type:'RaceDistrictFacts',version:1,roads:[road],anchor:{lat:50,lon:7},metersPerUnit:m};
  assert.ok(fit.maximumErrorMeters<=.003);const canonical=canonicalRaceDistrict(facts);assert.deepEqual(canonicalRaceDistrict(canonical),canonical);
 }
});

test('the normal collector partitions a complex published base without losing source order or graph continuity',async()=>{
 const {collectRaceDistrict}=await import('../app/js/racing/world-course-source.js'),{buildRaceRoadGraph,sampleRaceSegmentY}=await import('../app/js/racing/course-rules.js');
 const recipe={version:1,sourceLengthMeters:72,venueId:'controlled',sourceFeatureId:'controlled',sourceSha256:'a'.repeat(64),bands:[{side:1,startMeters:0,endMeters:72,widthMeters:.7,heightMeters:.045,rampMeters:.35,taperMeters:5,stripeMeters:1,phaseMeters:0}]},evidence={version:1,venueId:'controlled',sourceFeatureId:'controlled',surfaceModel:'banked-road-v1',maximumCrossfall:.7,venueSource:{sourceSha256:'a'.repeat(64)},edgeBandRecipe:recipe},feature={sourceFeatureId:'controlled',pts:[{x:0,z:0},{x:0,z:72}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportSurfaceModel:{surveyedSurface:{...evidence},reviewedSurfacePhase:'accepted',maximumReviewedCrossfall:0}},base=(x,z)=>10+z*.02+Math.max(0,.03-Math.abs(x-(-3+z/12))*.1),profile=(x,z)=>({baseY:base(x,z),y:base(x,z)+Math.max(0,Math.min(.045,(x-3.3)*.045/.35))}),contacts={sampleProfileAt:profile,sampleAt:(x,z)=>profile(x,z).y,crossSectionOffsets:()=>Array.from({length:161},(_,i)=>-4+i*.05)},ctx={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled',location:{lat:50,lon:7}},buildings:[],roadContactIndex:contacts,sampleFeatureSurfaceY:(_r,x,z)=>base(x,z),buildTraversalNetworks:()=>({drive:{segments:[{feature,p1:feature.pts[0],p2:feature.pts[1],segIndex:0,fromId:12,toId:13,direction:'forward'}]}}),SurfaceQuery:{driveAt:(x,z)=>({kind:'road',position:{y:profile(x,z).y}})}};
 const facts=await collectRaceDistrict(ctx,{yieldWork:async()=>{}});assert.equal(facts.roads.length,2);const [a,b]=facts.roads;assert.equal(a.b.connectionLayer,b.a.connectionLayer);assert.deepEqual(a.b,b.a);assert.equal(a.sourceId.split(':').at(-1),b.sourceId.split(':').at(-2));
 const graph=buildRaceRoadGraph(facts.roads,{metersPerUnit:1});assert.equal(graph.edges.length,2);assert.equal(graph.edges[0].to,graph.edges[1].from);assert.ok(Math.abs(graph.edges.reduce((n,e)=>n+e.length,0)-72)<1e-9);
 for(const road of facts.roads)for(const row of road.heightSamples)assert.ok(row.lateralSamples.length<=32);
 for(const offset of[-4,-1.2,0,1.2,3.5,4])assert.ok(Math.abs(sampleRaceSegmentY(a,1,offset)-sampleRaceSegmentY(b,0,offset))<=.0002);
});
