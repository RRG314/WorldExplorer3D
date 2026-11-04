import { decode, pt, select, receipt } from './science.mjs';
import { bundleHash } from './data-integrity.mjs';
export const exportLimits = [
  'The source is a preselected educational CMS sample, not all recorded collisions.',
  'Source rows contain reconstructed muon four-vectors, not hits, timestamps, detector covariance or generator truth.',
  'Helices, field changes, separated geometry and timelines are illustrations; they do not resimulate recorded events.',
  'Source rounding can change recomputed mass. No detector precision, background estimate or discovery significance is supplied.',
];
export function saveFile(name, content, type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function eventCSV(bundle,summary,indices) {
  return [...[bundle.columns.concat(['calculatedMass_GeV','pt1_GeV','pt2_GeV','sourceRow']).join(',')],...indices.map(i=>{
    const e=decode(bundle.events[i],i);
    return [...bundle.events[i],summary.mass[i],pt(e.muons[0]),pt(e.muons[1]),i+1].join(',');
  })].join('\n')+'\n';
}
let geometry=null;
if(typeof window!=="undefined") fetch('./geometry/manifest.json').then(r=>{if(!r.ok)throw Error('Unavailable geometry manifest');return r.json();}).then(value=>{geometry=value;}).catch(()=>{});
export function fullAnalysis(bundle,summary,selection,cut,charge,view=null) {
  if(!geometry)throw Error('Geometry source information is not ready. Reload this page and retry.');
  return {...receipt(bundle,selection,cut,charge),archive:{
    schema:'collision-lab-analysis-archive-v1',createdAt:new Date().toISOString(),application:'Collision Lab 0.6.0',
    dataset:bundle,derivedFileSha256:bundleHash,
    units:{energy:'GeV',momentum:'GeV/c',mass:'GeV/c²',position:'m',field:'T',charge:'elementary charge',animationTime:'explanatory seconds, not physical time'},
    baseline:receipt(bundle,select(summary,0,'all'),0,'all'),
    selectedEventsCSV:eventCSV(bundle,summary,selection.indices),
    histogramCSV:'low_GeV,high_GeV,selected,baseline\n'+selection.bins.map((n,i)=>`${i*2},${(i+1)*2},${n},${selectBaseline(summary)[i]}`).join('\n')+'\n',
    view,geometry,limitations:exportLimits,
    attribution:{data:'Thomas McCauley / CMS, CERN Open Data record 700, CC0 1.0',doi:'10.7483/OPENDATA.CMS.CB8H.MFFA',source:'https://opendata.cern.ch/record/700',geometry:'CMS iSpy WebGL, MIT; manifest identifies files and hashes'},
    coverage:'Includes the full numerical source dataset, selected rows with derived quantities, baseline and selected bins, settings and geometry provenance. Geometry binaries and application executables are not embedded. Playback restores paused. This is an analysis archive, not a simulated detector run.'
  }};
}
let cachedSummary=null,cachedBins=null;
function selectBaseline(summary){if(cachedSummary!==summary){cachedSummary=summary;cachedBins=select(summary,0,'all').bins;}return cachedBins;}
export function verifyArchive(r,bundle,summary,selection) {
  if(!r.archive)return;
  const a=r.archive;
  if(a.schema!=='collision-lab-analysis-archive-v1'||a.derivedFileSha256!==bundleHash||JSON.stringify(a.dataset)!==JSON.stringify(bundle))throw Error('Archive dataset does not match the verified source');
  if(JSON.stringify(a.baseline)!==JSON.stringify(receipt(bundle,select(summary,0,'all'),0,'all')))throw Error('Archive baseline does not reproduce');
  if(a.selectedEventsCSV!==eventCSV(bundle,summary,selection.indices))throw Error('Archive event table does not reproduce');
  const expected='low_GeV,high_GeV,selected,baseline\n'+selection.bins.map((n,i)=>`${i*2},${(i+1)*2},${n},${selectBaseline(summary)[i]}`).join('\n')+'\n';
  if(a.histogramCSV!==expected)throw Error('Archive histogram table does not reproduce');
  const v=a.view;if(!v)return;
  if(!Number.isInteger(v.index)||(selection.indices.length ? !selection.indices.includes(v.index) : v.index !== -1))throw Error('Invalid saved event');
  if(!Number.isFinite(v.field)||Math.abs(v.field)>8||!['perspective','transverse','longitudinal'].includes(v.view)||![-1,0,1].includes(v.isolated))throw Error('Invalid display settings');
  for(const k of ['cutaway','explode','xray','focus','revealed','log','reduced','storyActive'])if(typeof v[k]!=='boolean')throw Error('Invalid display flag');
  if(!Array.isArray(v.hidden)||v.hidden.some(x=>!['tracking','ecal','hcal','coil','muon'].includes(x)))throw Error('Invalid detector layers');
  if(!['economy','balanced','high'].includes(v.quality)||!['event','detector','accelerator'].includes(v.timeline?.mode)||!Number.isFinite(v.timeline.time)||v.timeline.time<0||v.timeline.time>24||![.5,1,2].includes(v.timeline.rate))throw Error('Invalid playback settings');
  if(v.camera)for(const k of ['position','target'])if(!Array.isArray(v.camera[k])||v.camera[k].length!==3||!v.camera[k].every(x=>Number.isFinite(x)&&Math.abs(x)<10000))throw Error('Invalid camera');
  if(v.camera&&(!Number.isFinite(v.camera.zoom)||v.camera.zoom<=0||v.camera.zoom>100))throw Error('Invalid zoom');
}
