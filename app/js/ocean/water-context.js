// Saved admission context, not a live salinity survey or permission to enlarge
// mapped water. Surface geometry remains owned by the water registry.
const kinds=new Set(['lake','river','harbor','channel','coastal','open_ocean']);
const truths=new Set(['published-water-surface','synthetic-transition','modeled-ocean-environment','legacy-ocean-assumption']);
const bounded=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
export function normalizeOceanWaterContext(value){
 if(value?.version!==1||!kinds.has(value.waterKind)||!truths.has(value.sourceTruth)||!bounded(value.sourceDataset,120)||!bounded(value.waterbodyId,220))return null;
 return Object.freeze({version:1,waterKind:value.waterKind,sourceDataset:value.sourceDataset,sourceTruth:value.sourceTruth,waterbodyId:value.waterbodyId});
}
export function defaultOceanWaterContext(site,{legacy=false}={}){
 return normalizeOceanWaterContext({version:1,waterKind:'open_ocean',sourceDataset:legacy?'legacy-ocean-voyage':'ocean-entry',sourceTruth:legacy?'legacy-ocean-assumption':'modeled-ocean-environment',waterbodyId:`ocean-site:${Number(site.lat).toFixed(4)}:${Number(site.lon).toFixed(4)}`});
}
export function oceanWaterContextFromCandidate(candidate,site){
 const source=candidate?.source||{};
 // Synthetic recovery retains the original admitted context; it does not
 // promote the recovery patch into a new geographic survey.
 const inherited=normalizeOceanWaterContext(source.oceanWaterContext);
 if(inherited&&inherited.waterKind===candidate.waterKind)return inherited;
 const synthetic=candidate?.synthetic===true||source.synthetic===true;
 const kind=candidate?.waterKind;
 return normalizeOceanWaterContext({version:1,waterKind:kind,
  sourceDataset:String(source.provenance?.dataset||source.registryProvenance?.geometrySource||source.geometrySource||(synthetic?'synthetic-transition':'published-water-registry')).slice(0,120),
  sourceTruth:synthetic?'synthetic-transition':'published-water-surface',
  waterbodyId:String(source.registryId||source.sourceFeatureId||source.id||`${synthetic?'synthetic':'mapped'}:${Number(site.lat).toFixed(4)}:${Number(site.lon).toFixed(4)}:${kind}`).slice(0,220)});
}
