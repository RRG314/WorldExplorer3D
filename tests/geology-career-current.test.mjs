import test from 'node:test';import assert from 'node:assert/strict';
import {transitionGeologyCareer,normalizeGeologyCareer,GEOLOGY_STUDIES,geologyCareerSummary} from '../app/js/campaign/geology-career.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
const site={id:'virtual-geology:druid-hill',name:'Druid Hill virtual field course',truthType:'virtual-training-site',location:{lat:39.3189,lon:-76.6363},points:{a:{lat:39.3189,lon:-76.6363},b:{lat:39.3189,lon:-76.6361},bench:{lat:39.319,lon:-76.6362}}};
const evidence=(id,at)=>({environment:'EARTH',travelMode:'walk',supported:true,verticalDistance:0,liveGps:false,position:site.points[id],siteId:site.id,at});
const accept={type:'accept',revision:0,runId:'test-study-a',site,variantId:'campaign'};
function step(state,command,at){return transitionGeologyCareer(state,{revision:state.revision,...command},at);}
function commands(state,variantId='campaign'){
 const study=GEOLOGY_STUDIES[variantId];let at=100;
 const rows=[{type:'observe',texture:study.a.texture,grain:study.a.grain,target:'a'},{type:'observe',texture:study.b.texture,grain:study.b.grain,target:'b',mapScope:'context-not-proof',map:{status:'reference',fetchedAt:'2026-11-02T12:00:00Z',items:[{id:'usgs:unit',name:'Published unit',material:'Map description',citation:'USGS',sourceUrl:'https://energy.usgs.gov/arcgis/rest/services/Hosted/mapunitpolys_esurf_labels/FeatureServer/0'}]}},{type:'collect',sampleId:'a',labelSite:'a',labelLayer:'face-a',target:'a'},{type:'collect',sampleId:'b',labelSite:'b',labelLayer:'face-b',target:'b'},...['a','b'].flatMap(sampleId=>['lens','scratch'].map(method=>({type:'test',sampleId,method,target:'bench'}))),{type:'classify',classifications:{a:study.a.classification,b:study.b.classification},target:'bench'},{type:'interpret',interpretation:study.interpretation,target:'bench'}];
 return rows.map(row=>{at+=100;return {...row,at};});
}
function complete(base=null,variantId='campaign'){
 let state=step(normalizeGeologyCareer(base),{...accept,variantId,runId:'test-study-'+variantId,revision:normalizeGeologyCareer(base).revision},100).state;const samples=[];
 for(const row of commands(state,variantId)){
  const {target,at,...command}=row;const result=step(state,{...command,evidence:evidence(target,at),custody:Object.values(state.active.samples).map(s=>s.instanceId)},at);state=result.state;samples.push(...result.samples);
 }
 return {state,samples};
}
test('a complete field study has different physical observation, labeling, bench and interpretation decisions',()=>{
 const {state,samples}=complete();assert.equal(state.active.phase,'complete');assert.equal(samples.length,2);assert.notEqual(samples[0].catalogId,samples[1].catalogId);assert.equal(samples.every(s=>s.tradeable===false&&s.researchLabel.layer),true);assert.ok(state.completed.campaign);assert.equal(Object.keys(state.active.tests).length,4);assert.equal(state.active.map.scope,'published-map-not-proof-of-training-rocks');assert.equal(geologyCareerSummary(state).choices.length,3);
});
test('remote, airborne, GPS or unsupported actions and wrong observations do not advance a study',()=>{
 const state=transitionGeologyCareer(null,accept,100).state;
 const command={type:'observe',texture:'interlocking-crystals',grain:'coarse',evidence:evidence('a',200)};
 for(const value of [{...command,evidence:{...command.evidence,travelMode:'drive'}},{...command,evidence:{...command.evidence,liveGps:true}},{...command,evidence:{...command.evidence,supported:false}},{...command,evidence:{...command.evidence,verticalDistance:20}},{...command,evidence:{...command.evidence,position:site.points.b}},{...command,texture:'rounded-grains'}])assert.throws(()=>step(state,value,200));
 assert.equal(state.active.phase,'exposure-a');
});
test('sampling requires site and face labels; comparison requires all real tests and carried custody',()=>{
 let state=transitionGeologyCareer(null,accept,100).state;const rows=commands(state);
 for(const row of rows.slice(0,2)){state=step(state,{...row,evidence:evidence(row.target,row.at)},row.at).state;}
 assert.throws(()=>step(state,{type:'collect',sampleId:'a',labelSite:'b',labelLayer:'face-b',evidence:evidence('a',400)},400));
 for(const row of rows.slice(2,4))state=step(state,{...row,evidence:evidence(row.target,row.at)},row.at).state;
 assert.throws(()=>step(state,{type:'test',sampleId:'a',method:'lens',custody:[],evidence:evidence('bench',600)},600));
 assert.throws(()=>step(state,{type:'classify',classifications:{a:'igneous',b:'sedimentary'},evidence:evidence('bench',700)},700));
});
test('the two repeat studies change the evidence question and preserve the first capstone',()=>{
 assert.throws(()=>transitionGeologyCareer(null,{...accept,variantId:'cooling-rates'},100));
 let {state}=complete();const receipt=state.completed.campaign;
 state=complete(state,'cooling-rates').state;assert.equal(state.completed.campaign,receipt);assert.equal(state.active.classifications.b,'igneous');
 state=complete(state,'sediment-comparison').state;assert.equal(Object.keys(state.completed).length,3);assert.equal(state.active.observations.b.texture,'fine-laminae');
});
test('Journal profile owner serializes revisions and stores labeled sample claims without resetting other fields',async()=>{
 const store=createMemoryDiscoveryProfileStore({profile:{retainedFutureField:{keep:true}}});let result=await store.updateResearchCareer('geology',accept,{now:100});
 const row=commands(result.state)[0],command={...row,revision:result.state.revision,evidence:evidence('a',row.at)};
 const results=await Promise.allSettled([store.updateResearchCareer('geology',command,{now:row.at}),store.updateResearchCareer('geology',command,{now:row.at})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 let state=(await store.getProfile()).researchCareers.geology;
 for(const row of commands(state).slice(1)){const {target,at,...command}=row;result=await store.updateResearchCareer('geology',{...command,revision:state.revision,evidence:evidence(target,at),custody:Object.values(state.active.samples).map(s=>s.instanceId)},{now:at});state=result.state;}
 const backup=await store.exportData(),damaged=structuredClone(backup);damaged.items=[];await assert.rejects(store.importData(damaged));const restored=createMemoryDiscoveryProfileStore();await restored.importData(backup);assert.equal((await restored.getProfile()).researchCareers.geology.active.phase,'complete');
 assert.equal((await store.listItems()).filter(item=>item.researchLabel?.careerId==='geology').length,2);assert.equal((await store.getProfile()).retainedFutureField.keep,true);assert.equal(state.active.phase,'complete');
});
