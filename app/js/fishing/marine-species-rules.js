// Broad, conservative game eligibility, not occurrence polygons or abundance.
// The water authority must independently establish water coverage. Spawn bands
// are authored presentation choices inside the species' habitat, not a claim
// that these are the biological limits of the species.
const rule = (scientificName, regions, spawnDepthMeters, sources, options = {}) => Object.freeze({
  scientificName, regions: Object.freeze(regions.map(Object.freeze)),
  spawnDepthMeters: Object.freeze(spawnDepthMeters), sources: Object.freeze(sources),
  groupSize: 8, position: 'water-column', ...options
});
const allWarmOceans = [[-180, 180, -34, 34]];
export const MARINE_SPECIES_RULES = Object.freeze({
  striped_bass: rule('Morone saxatilis', [[-92,-52,28,50],[-130,-114,28,53]], [1,35],
    ['https://www.fisheries.noaa.gov/species/atlantic-striped-bass']),
  red_drum: rule('Sciaenops ocellatus', [[-98,-66,20,42]], [1,25],
    ['https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/red-drum/'], {groupSize:5}),
  summer_flounder: rule('Paralichthys dentatus', [[-82,-52,25,47]], [1,80],
    ['https://www.fisheries.noaa.gov/species/summer-flounder'], {groupSize:3,position:'near-bottom'}),
  mahi_mahi: rule('Coryphaena hippurus', allWarmOceans, [1,30],
    ['https://www.fisheries.noaa.gov/species/atlantic-mahi-mahi'], {groupSize:5}),
  atlantic_tarpon: rule('Megalops atlanticus', [[-98,-34,-30,38],[-20,18,-18,30]], [1,30],
    ['https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tarpon/'], {groupSize:4}),
  // Preserve the saved catalogue ID; new records use the resolved Atlantic name.
  bluefin_tuna: rule('Thunnus thynnus', [[-100,0,18,64],[-20,37,30,46]], [4,120],
    ['https://www.fisheries.noaa.gov/species/western-atlantic-bluefin-tuna'], {groupSize:5}),
  yellowfin_tuna: rule('Thunnus albacares', allWarmOceans, [4,100],
    ['https://www.fisheries.noaa.gov/species/pacific-yellowfin-tuna'], {groupSize:6}),
  sailfish: rule('Istiophorus platypterus', allWarmOceans, [2,60],
    ['https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sailfish/'], {groupSize:2}),
  giant_trevally: rule('Caranx ignobilis', [[30,180,-34,34],[-180,-130,-34,34]], [1,80],
    ['https://biogeodb.stri.si.edu/sftep/en/thefishes/species/5455'], {groupSize:8})
});

export function marineSpeciesEligible(speciesId, {latitude,longitude,habitat='unknown'}={}) {
  const entry=MARINE_SPECIES_RULES[speciesId];
  if(!entry)return true; // Freshwater catalogue has a separately disclosed scope.
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return false;
  if(!entry.regions.some(([west,east,south,north])=>longitude>=west&&longitude<=east&&latitude>=south&&latitude<=north))return false;
  // A known abyssal benthic habitat cannot substitute for coastal or epipelagic
  // animals. Unknown habitat never becomes a claim of a surveyed reef.
  if(['abyssal-bottom','hydrothermal-vent','freshwater'].includes(habitat))return false;
  if(habitat==='coral-reef' && !['giant_trevally'].includes(speciesId))return false;
  return true;
}
