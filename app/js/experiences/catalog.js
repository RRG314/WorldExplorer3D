import { ACTIVITY_TEMPLATES } from '../activity-discovery/schema-core.js?v=1';
import { careerAvailability, orderCareerEntries } from './career-availability.js';

// Display references only. The named runtime adapter rechecks admission when play starts.
const careers = [
  ['racer','Racer','First clean finish','racing','Prepare your car, finish cleanly and build your race record.'],
  ['geologist','Geologist','Reading the Landscape','geology','Compare rock exposures, labeled samples and the story of a landscape.'],
  ['archaeologist','Archaeologist','A Place in Context','archaeology','Survey a training site and interpret objects with their layers and locations.'],
  ['mining-engineer','Mining engineer','From Vein to Material','mining','Survey a virtual quarry, work a supported face and restore the site.'],
  ['palaeontologist','Palaeontologist','The Fossil Bed','palaeontology','Record a fossil in context, prepare it carefully and compare its form.'],
  ['oceanographer','Oceanographer','Across the Water Column','oceanography','Compare coastal stations, survey the seabed and return to your research ship.'],
  ['marine-biologist','Marine biologist','Life Along the Slope','marine-biology','Observe marine life and compare the habitats where you find it.'],
  ['wildlife-ecologist','Wildlife ecologist','Two Habitats','wildlife','Use comparable watches to investigate two different habitats.'],
  ['botanist','Botanist','A Living Patch','botany','Study plant structures and follow a virtual restoration plot through a season.'],
  ['hydrologist','Hydrologist','Following the Water','hydrology','Measure two stream stations and investigate changes along the catchment.'],
  ['meteorologist','Meteorologist','Reading the Sky','meteorology','Compare weather stations and test a forecast against observations.'],
  ['cartographer','Cartographer','Make the Route Usable','cartography','Measure a route, check access and prepare a useful route sheet.'],
  ['planetary-scientist','Planetary scientist','Two Sides of the Moon','planetary','Compare lunar sites and bring your observations safely home.'],
  ['astronomer','Astronomer',"A Night’s Observing",'astronomy','Align an instrument, compare observations and keep a reproducible log.'],
  ['accelerator-scientist','Accelerator scientist','Collision Lab','accelerator','Steer beams, inspect detector measurements and analyze recorded collisions.'],
  ['field-engineer','Field engineer','Make a Useful Place','engineering','Diagnose a need, build or repair something useful and test the result.'],
  ['expedition-pilot','Expedition pilot','Flight training','pilot','Structured flight assignments are in development. Free flight and Harbor Run road deliveries remain available.'],
  ['documentary-explorer','Documentary explorer','A Place in Three Views','documentary','Tell a visual story with contrasting photographs and a saved album.'],
  ['explorer','Explorer','First Bearings','explorer','Find your bearings, record a discovery and choose your next journey.'],
  ['companion-handler','Companion handler','Exploring Together','companions','Care for a companion, build trust and learn useful field skills together.']
];
export const CAREER_EXPERIENCES = Object.freeze(careers.map(([id,label,assignment,adapterId,summary]) => Object.freeze({
  id:`career:${id}`,kind:'career',label,assignment,adapterId,summary,...careerAvailability(id),
  persistence:'Your Journal and career progress save in this browser.'
})));
const quick = [
  ['racing','Road racing','Choose an event, prepare your car or create a track.'],
  ['trial','Time trial','Reach the gold destination ring before time runs out.'],
  ['checkpoint','Checkpoint run','Drive through all the marked road checkpoints.'],
  ['painttown','Paint Town','Paint buildings and compete with your room.'],
  ['flower','Flower Sprint','Find the marked flowers and improve your time.'],
  ['deflock','DeFlock Hunt','Explore mapped camera locations and complete the hunt.']
];
export const QUICK_EXPERIENCES = Object.freeze([
  Object.freeze({id:'activity:harbor-run',kind:'activity',label:'Harbor Run delivery',assignment:'Harbor Run',adapterId:'pilot',summary:'Plan a road delivery, load the field case and bring your equipment home safely.',persistence:'Your delivery and cargo progress save in your Journal in this browser.'}),
  ...quick.map(([mode,label,summary])=>Object.freeze({id:`game:${mode}`,kind:'game',label,assignment:label,adapterId:'game',mode,summary,persistence:'Results save in your Journal. Online rankings require a successful upload.'})),
  ...ACTIVITY_TEMPLATES.map(row=>Object.freeze({id:`route:${row.id}`,kind:'route',label:row.label,assignment:row.label,adapterId:'route',templateId:row.id,summary:'Choose a local route, review its checkpoints and follow the marked course.',persistence:'Your created routes and Journal save in this browser.'}))
]);
export const EXPERIENCES=Object.freeze([...CAREER_EXPERIENCES,...QUICK_EXPERIENCES]);
const byId=new Map(EXPERIENCES.map(row=>[row.id,row]));
export function experienceById(id){return byId.get(String(id||''))||null;}
export const LEGACY_EXPERIENCE_IDS=Object.freeze(Object.fromEntries([
  ...quick.map(([id])=>[id,`game:${id}`]),...ACTIVITY_TEMPLATES.map(row=>[row.id,`route:${row.id}`]),['free','explore'],['livegps','live-gps'],
  ['general','career:explorer'],['geology','career:geologist'],['wildlife','career:wildlife-ecologist'],
  ['botany','career:botanist'],['palaeontology','career:palaeontologist'],['habitats','career:wildlife-ecologist']
]));
export function resolveExperienceId(id){const key=String(id||'');return experienceById(key)?.id||LEGACY_EXPERIENCE_IDS[key]||null;}
export function filterExperiences({view='careers',query=''}={}){const needle=String(query).trim().toLowerCase();return orderCareerEntries(EXPERIENCES.filter(row=>(view==='careers'?row.kind==='career':row.kind!=='career')&&(!needle||`${row.label} ${row.assignment} ${row.summary}`.toLowerCase().includes(needle))));}
