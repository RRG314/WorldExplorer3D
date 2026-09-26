import {withExpeditionChanges} from './model.js?v=12';

export const RESEARCH_BENCHES=Object.freeze({
 'science-bench':{roomId:'science',deckId:'command',label:'Spectrometry bench',template:{x:-8.1,z:-3.3},instrument:'spectrum'},
 'analysis-bench':{roomId:'analysis-data',deckId:'command',label:'Thermal analysis bench',template:{x:-8.1,z:-18.2},instrument:'thermal'},
 'fabrication-bench':{roomId:'cargo-fabrication',deckId:'engineering',label:'Composite workbench',template:{x:-8.2,z:-3.7},instrument:'fabricate'}
});
export function sampleIsMounted(expedition,id){return Object.values(expedition.research?.benches||{}).some(slots=>slots.includes(id));}
export function availableResearchSample(sample){return sample&&!sample.exported&&!sample.consumed&&!sample.outputs&&Number.isFinite(sample.massKg)&&sample.massKg>0;}
export function applyResearchCommand(expedition,command){
 const bench=RESEARCH_BENCHES[command.benchId];
 const reject=message=>({expedition,changed:false,message});
 if(!bench)return reject('Unknown research workbench.');
 const research=structuredClone(expedition.research||{benches:{},studies:{}});
 research.benches||={};research.studies||={};
 const slots=research.benches[command.benchId]||[null,null];
 research.benches[command.benchId]=slots;
 const samples=(expedition.scienceSamples||[]).map(s=>({...s}));
 const resources={...expedition.resources};
 let message;
 if(command.researchAction==='place'){
  const sample=samples.find(s=>s.id===command.sampleId);
  if(!availableResearchSample(sample)||sampleIsMounted(expedition,sample.id))return reject('That sample is unavailable or already on a bench.');
  const index=slots.indexOf(null);if(index<0)return reject('Both cradles are occupied. Return a sample to cargo first.');
  slots[index]=sample.id;message=`Placed ${sample.label} in cradle ${index+1}.`;
 }else if(command.researchAction==='return'){
  const index=slots.indexOf(command.sampleId);if(index<0)return reject('That sample is not on this bench.');
  slots[index]=null;message='Sample returned to its sealed cargo container.';
 }else if(command.researchAction==='measure'){
  if(bench.instrument==='fabricate')return reject('Use the laboratory instruments to characterize these samples.');
  const mounted=slots.map(id=>samples.find(s=>s.id===id)).filter(availableResearchSample);
  if(!mounted.length)return reject('Place a sample in an instrument cradle first.');
  const pending=mounted.filter(s=>!research.studies[s.id]?.[bench.instrument]);
  if(!pending.length)return reject('These measurements are already recorded.');
  const cost=.025*pending.length;
  if(!(Number(resources.powerMWh)>=cost))return reject(`This measurement requires ${cost} MWh.`);
  resources.powerMWh-=cost;
  for(const sample of pending){
   research.studies[sample.id]||={};
   research.studies[sample.id][bench.instrument]={bodyId:sample.bodyId||null,massKg:sample.massKg,atMissionS:Number(expedition.strategicElapsedS)||0,truthClass:sample.truthClass||'modeled-game-sample',result:bench.instrument==='spectrum'?'Spectral fingerprint recorded; source provenance retained.':'Thermal response recorded; composite fabrication eligibility established.'};
  }
  message=`${bench.instrument==='spectrum'?'Spectral':'Thermal'} measurements recorded for ${pending.length} sample${pending.length===1?'':'s'}.`;
 }else if(command.researchAction==='fabricate'){
  if(bench.instrument!=='fabricate')return reject('Use the fabrication workbench.');
  const mounted=slots.map(id=>samples.find(s=>s.id===id));
  if(mounted.length!==2||!mounted.every(availableResearchSample)||mounted[0].id===mounted[1].id)return reject('Place two distinct characterized samples in the cradles.');
  if(!mounted.every(s=>research.studies[s.id]?.spectrum&&research.studies[s.id]?.thermal))return reject('Both samples need spectral and thermal measurements first.');
  if(mounted.some(s=>s.recoveryRequirement))return reject('Mission recovery material must use its specified recovery process.');
  const mass=mounted.reduce((sum,s)=>sum+s.massKg,0);
  if(!(resources.scienceCargoKg>=mass&&resources.feedstockKg>=2&&resources.powerMWh>=.1))return reject('Requires the mounted cargo lots, 2 kg binder feedstock and 0.1 MWh.');
  resources.scienceCargoKg-=mass;resources.feedstockKg-=2;resources.powerMWh-=.1;
  resources.maintenanceKg=Number(resources.maintenanceKg||0)+mass+2;
  for(const sample of mounted){sample.consumed=true;sample.processed=true;sample.outputs={maintenanceKg:sample.massKg};}
  research.benches[command.benchId]=[null,null];
  research.lastFabrication={sampleIds:mounted.map(s=>s.id),outputKg:mass+2,atMissionS:Number(expedition.strategicElapsedS)||0};
  message=`Fabricated ${mass+2} kg of composite repair stock from two characterized samples and 2 kg binder. Available to Engineering repairs.`;
 }else return reject('Unknown workbench action.');
 const next=withExpeditionChanges(expedition,{research,scienceSamples:samples,resources,log:[...(expedition.log||[]),{kind:'research',atMissionS:Number(expedition.strategicElapsedS)||0,message}]});
 return {expedition:next,changed:true,message};
}
