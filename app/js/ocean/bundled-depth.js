import {parseLocalBathymetryGrid,sampleLocalBathymetryGrid} from './bathymetry.js?v=5';
import {normalizeDepthEvidence} from '../geospatial/bathymetry-evidence.js?v=1';
let pending=null;
// Share the ocean's parser and interpolation rules; this is a small chart read,
// not a second ocean scene, navigation authority or live observation.
export function bundledCoastalDepth(payload,lat,lon){
 const grid=parseLocalBathymetryGrid(payload),elevation=sampleLocalBathymetryGrid(grid,lat,lon);
 if(!grid||grid.source?.dataset!=='gebco2020'||!Number.isFinite(elevation)||elevation>=0)return null;
 return {...normalizeDepthEvidence({truthType:'modeled',elevationMeters:elevation,sourceId:'gebco2020-bundled',dataset:'GEBCO 2020',datasetRelease:'2020',fetchedAt:grid.source.queryDateUtc,sourceUrl:'https://www.gebco.net/data_and_products/gridded_bathymetry_data/',navigationSafe:false}),bundled:true};
}
export async function fetchBundledCoastalDepth(lat,lon){
 if(!pending)pending=fetch(new URL('../../data/ocean-bathymetry-great-barrier-reef.json',import.meta.url),{signal:AbortSignal.timeout(5000)})
  .then(response=>{if(!response.ok)throw Error('Bundled chart unavailable');return response.json();}).then(payload=>{if(!parseLocalBathymetryGrid(payload))throw Error('Bundled chart is malformed');return payload;}).catch(error=>{pending=null;throw error;});
 return bundledCoastalDepth(await pending,lat,lon);
}
