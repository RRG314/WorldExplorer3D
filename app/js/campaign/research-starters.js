// Only methods already owned by the released field runtime are admitted here.
// These are first field assignments, not claims that later career campaigns ship.
export const RESEARCH_STARTERS = Object.freeze([
  {id:'general',label:'Explore nearby',activities:[],brief:'Choose a nearby field lead, record what you find, then review it in your Journal.',result:'A first field record',question:'What can you discover nearby?'},
  {id:'geology',label:'Geology',activities:['geology-inspect'],brief:'Reach a geology study point, read its published geological context, then save and review the study. A mapped unit is not proof of exposed rock.',result:'A location-specific geology study',question:'What does the geological map say about this place?'},
  {id:'wildlife',label:'Wildlife ecology',activities:['nature-observe','wildlife-track'],brief:'Follow a wildlife lead, keep still to document it, then review the species or sign in your Journal. These are virtual field observations.',result:'A wildlife observation with its habitat context',question:'What wildlife evidence fits this habitat?'},
  {id:'botany',label:'Botany',activities:['forage'],brief:'Reach a virtual plant study point, examine the plant record, then save and review it. This is identification practice, not advice about edible plants.',result:'A plant identification record',question:'Which plant characteristics help identify this field lead?'},
  {id:'palaeontology',label:'Palaeontology',activities:['fossil-document'],brief:'Document a virtual fossil study in a compatible formation, leave the site intact, then review its record. A training cast is not a real fossil discovery.',result:'A fossil documentation record',question:'What does this fossil representation preserve?'},
  {id:'habitats',label:'Habitat surveying',activities:['habitat-survey'],brief:'Reach a habitat survey point, make the field observation, then review its setting and evidence in your Journal.',result:'A habitat field record',question:'What defines the habitat at this survey point?'}
].map(row=>Object.freeze({...row,activities:Object.freeze(row.activities)})));
export const researchStarter = id => RESEARCH_STARTERS.find(row=>row.id===String(id||'general')) || null;
export const starterAcceptsActivity = (id,activity) => {
  const starter=researchStarter(id);return !!starter && (!starter.activities.length || starter.activities.includes(activity));
};
export function availableResearchStarters(slots=[]) {
  return RESEARCH_STARTERS.filter(starter=>slots.some(slot=>starterAcceptsActivity(starter.id,slot.activityId)));
}
