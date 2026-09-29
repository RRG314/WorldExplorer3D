import { buildingRegionCountry } from './building-region-lookup.js';
// Regional inference changes presentation only. Source tags, footprint, height,
// identity and collision authority remain with the mapped building compiler.
const VERSION = 'regional-building-style-v1';
const RESIDENTIAL = new Set(['house','dwelling_house','detached','semi','semidetached_house','bungalow','terrace','apartments','residential','farmhouse','cabin']);
const normalize = value => String(value || '').trim().toLowerCase().replace(/[ -]+/g, '_');
function decision(id, basis, materials, roof = null) {
  return Object.freeze({version:VERSION,id,basis,confidence:basis==='mapped_architecture'?'mapped-style':'regional-inference',
    materials:Object.freeze(materials),roof:roof?Object.freeze(roof):null});
}
const STYLES = Object.freeze({
  mission_revival: decision('mission-revival','mapped_architecture',['stucco_cream','stucco_white'],{shape:'hipped',color:'#9a5943',material:'roof_tiles',pitchRatio:.22}),
  mediterranean: decision('mediterranean-masonry','mapped_architecture',['stucco_cream','stucco_earth','light_stone'],{shape:'hipped',color:'#9a5943',material:'roof_tiles',pitchRatio:.24}),
  italianate: decision('italianate','mapped_architecture',['stucco_cream','limestone','red_brick'],{shape:'hipped',color:'#67615c',pitchRatio:.18}),
  queen_anne: decision('queen-anne','mapped_architecture',['siding_light','siding_dark','red_brick']),
  colonial_revival: decision('colonial-revival','mapped_architecture',['siding_light','red_brick','painted_brick_light']),
  machiya: decision('machiya','mapped_architecture',['timber_dark','timber_brown'],{shape:'gabled',color:'#505257',pitchRatio:.3}),
  chalet: decision('chalet','mapped_architecture',['timber_brown','timber_dark','siding_light'],{shape:'gabled',color:'#646168',pitchRatio:.38})
});

const JAPAN = decision('japan-contemporary-lowrise','country-and-use',['stucco_white','concrete_light','concrete_panel']);
const SOUTHERN_EUROPE = decision('southern-europe-lowrise','country-and-use',['stucco_cream','stucco_white','stucco_earth','light_stone']);
const NORTHERN_CABIN = decision('northern-cabin','country-and-use',['timber_brown','timber_dark','siding_light']);

export function resolveRegionalBuildingStyle(options = {}) {
  const tags=options.tags||{},type=normalize(tags.building||tags['building:part']||options.buildingType);
  if(!RESIDENTIAL.has(type) || tags.ruins==='yes' || tags.building==='ruins')return null;
  const height=Number(options.heightMeters),levels=Number(tags['building:levels']||options.levels);
  if((Number.isFinite(height)&&height>18)||(Number.isFinite(levels)&&levels>5))return null;
  const style=normalize(tags['building:architecture']||tags.architecture||tags['architectural_style']);
  // An unsupported named style should not be replaced by a contradictory
  // location inference. Its mapped value remains available in provenance.
  if(style)return STYLES[style]||null;
  const country=buildingRegionCountry(options.location || options.geographicCenter || {});
  if(country==='JP')return JAPAN;
  if(['IT','ES','PT','GR','MT'].includes(country))return SOUTHERN_EUROPE;
  if(type==='cabin'&&['NO','SE','FI','CA'].includes(country))return NORTHERN_CABIN;
  return null;
}
