import { createProviderRegistry } from './provider-registry.js?v=2';

// Query data, never a rendered map. Service identity is explicit: do not label
// this deployment v2 merely because a newer national viewer was announced.
export const GEOLOGY_SOURCE = 'https://energy.usgs.gov/arcgis/rest/services/Hosted/mapunitpolys_esurf_labels/FeatureServer/0';
const FIELDS = 'f_mapunitpolys_id,name,geomaterial,geomaterialconfidence,age,map_citation,ngmdb_url';
const text = value => String(value ?? '').slice(0, 4000);
function coordinates(input) {
  for (const [key, limit] of [['lat',90],['lon',180]]) {
    if (input[key] === null || input[key] === '' || typeof input[key] === 'boolean' || !Number.isFinite(Number(input[key])) || Math.abs(Number(input[key])) > limit) throw new Error(`Invalid geology ${key}`);
  }
  // Do not round across geological boundaries to improve cache hit rates.
  return {lat:Number(input.lat),lon:Number(input.lon)};
}
export function normalizeUSGS(body) {
  if(body.error) throw new Error('USGS geology query failed');
  if(body.exceededTransferLimit) throw new Error('USGS geology response is incomplete');
  if(!Array.isArray(body.features)) throw new Error('USGS geology schema unavailable');
  return body.features.slice(0,16).map(({attributes:a={}})=>({
    id:`usgs-surface:${text(a.f_mapunitpolys_id)}`,name:text(a.name),material:text(a.geomaterial),age:text(a.age),
    confidence:text(a.geomaterialconfidence),citation:text(a.map_citation),sourceUrl:/^https:\/\/ngmdb\.usgs\.gov\//.test(a.ngmdb_url||'')?a.ngmdb_url:GEOLOGY_SOURCE,
    provider:'usgs-cngm-surface',layer:'mapped-surface-unit',license:'USGS source attribution',
  })).filter(u=>u.name&&u.material&&u.id!=='usgs-surface:');
}
export function normalizeMacrostrat(body) {
  if(!Array.isArray(body.success?.data)) throw new Error('Macrostrat geology schema unavailable');
  const refs=body.success.refs||{};
  return body.success.data.slice(0,16).map(a=>({id:`macrostrat:${text(a.source_id)}:${text(a.map_id)}`,name:text(a.name),material:text(a.lith),age:text(a.best_int_name),confidence:'Source-dependent; regional map',citation:text(refs[a.source_id]),sourceUrl:`https://macrostrat.org/api/v2/defs/sources?source_id=${encodeURIComponent(a.source_id)}`,provider:'macrostrat',layer:'regional-geologic-map',license:'CC-BY-4.0'})).filter(u=>u.name&&u.material);
}
export function createGeologyService({fetchImpl=globalThis.fetch?.bind(globalThis),now}={}) {
  const registry=createProviderRegistry({now,maxCacheEntries:64});
  async function read(url,signal) {
    const response=await fetchImpl(url,{signal});
    if(!response.ok)throw new Error(`Geology provider HTTP ${response.status}`);
    const body=await response.text();if(body.length>1024*1024)throw new Error('Geology response exceeds budget');
    return JSON.parse(body);
  }
  registry.register({id:'geology-point',sourceId:'geology-source-selection-v1',cacheTtlMs:86400000,timeoutMs:10000,normalizeRequest:coordinates,
    async query(point,{signal}) {
      const url=new URL(`${GEOLOGY_SOURCE}/query`);
      url.search=new URLSearchParams({f:'json',geometry:`${point.lon},${point.lat}`,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:FIELDS,returnGeometry:'false',resultRecordCount:'16'});
      const warnings=[];let items=[];
      try{items=normalizeUSGS(await read(url.href,signal));}catch(error){if(signal.aborted)throw error;warnings.push('USGS unavailable; regional fallback requested.');}
      if(!items.length){const fallback=new URL('https://macrostrat.org/api/v2/geologic_units/map');fallback.search=new URLSearchParams({lat:point.lat,lng:point.lon});items=normalizeMacrostrat(await read(fallback.href,signal));}
      if(!items.length)warnings.push('No mapped geology returned. No rock type is inferred from terrain alone.');
      return {items,warnings};
    }});
  return {lookup:(point,options)=>registry.query('geology-point',point,options)};
}
let service;
export const lookupGeology=(point,options)=>(service ||= createGeologyService()).lookup(point,options);

export function geologyRecord(result) {
  const units=result.items||[];
  if(!units.length)throw new Error('No mapped geology is available here. Try another location; no guessed specimen was saved.');
  // Multiple intersecting maps/units remain alternatives, not a confidence vote.
  const names=[...new Set(units.map(u=>u.name))];
  return {
    name:`Geology study · ${names.join(' / ')}`.slice(0,240),
    description:units.map(u=>`${u.name}: ${u.material}. Age: ${u.age||'unspecified'}. ${u.citation}`).join('\n').slice(0,12000),
    geologyEvidence:{schemaVersion:1,point:result.query,fetchedAt:result.fetchedAt,units,warnings:result.warnings,interpretation:'mapped-units-not-observed-specimens',exposure:'not-established',collectingPermission:'not-established'},
    sourceRefs:units.map(u=>({sourceId:u.provider,recordId:u.id,url:u.sourceUrl,citation:u.citation,license:u.license,truthType:'reference'}))
  };
}
