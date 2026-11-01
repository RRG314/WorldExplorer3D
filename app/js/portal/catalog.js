// Reviewed learning content and typed game intents. Assessments are published
// separately after actual scene/device qualification; an entry is not approval.
const entries = [
  {
    id:'baltimore-harbor',title:'Baltimore · A city shaped by water',region:'Maryland, United States',
    topic:'Harbors & history',tags:['city','coast','nature'],preset:'baltimore',
    summary:'Meet the working waterfront where city streets and the Chesapeake watershed come together.',
    image:'/assets/landing/current/baltimore-harbor-hero.webp',imageAlt:'World Explorer gameplay at Baltimore harbor',
    learning:{version:'2026.10.25.1',title:'A harbor is more than a shoreline',
      paragraphs:[
        'Baltimore’s port connects the city to the Chesapeake Bay. Its channels have been surveyed and deepened over generations so ships can reach the waterfront.',
        'Water depth, coastline shape and access from land all influence where a port can grow. As you look at a harbor, notice the sheltered water and the roads that connect its edges.',
        'In World Explorer, look for the meeting of streets and water. Learning about a place here is recorded separately from visiting its 3D world.'
      ],sources:[{title:'Maryland State Archives · Port of Baltimore',url:'https://msa.maryland.gov/msa/mdmanual/01glance/html/port.html'}]},
    destination:{type:'PortalDestination',schemaVersion:1,id:'baltimore-harbor',revision:'1',contentVersion:'baltimore-portal-1',
      environment:'EARTH',kind:'city',origin:{lat:39.2904,lon:-76.6122},bounds:{south:39.26,north:39.32,west:-76.65,east:-76.57},
      // This is self-guided exploration, not a registered mission or an expedition award.
      arrival:{lat:39.2904,lon:-76.6122,mode:'walk'},experienceIds:['waterfront-exploration']}
  },
  {
    id:'monaco-coast',title:'Monaco · Where land meets the Mediterranean',region:'Monaco',
    topic:'Coasts & navigation',tags:['coast','nature','city'],preset:'monaco',
    summary:'Investigate a natural bay and the relationship between a compact coastal city and the sea.',
    image:null,imageAlt:null,
    learning:{version:'2026.10.25.1',title:'Why a sheltered bay matters',
      paragraphs:[
        'Port Hercule occupies a natural bay below Monaco’s historic rock. The shape of the coast helps explain why this location became a harbor.',
        'A harbor gives boats a place to gather and shelter. Its entrance, breakwaters and surrounding land each influence the journey between open sea and shore.',
        'When exploring a coastal world, compare the open water with the enclosed basin. A map can show the coastline, while walking or driving reveals how steeply the land rises.'
      ],sources:[{title:'Ports of Monaco · Port Hercule',url:'https://www.ports-monaco.com/en/the-ports-of-monaco/port-hercule/'}]},
    destination:{type:'PortalDestination',schemaVersion:1,id:'monaco-coast',revision:'1',contentVersion:'monaco-portal-1',
      environment:'EARTH',kind:'coast',origin:{lat:43.7384,lon:7.4246},bounds:{south:43.71,north:43.77,west:7.39,east:7.46},
      arrival:{lat:43.7384,lon:7.4246,mode:'walk'},experienceIds:['coastal-exploration']}
  }
];

function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const PORTAL_CATALOG=freeze({schemaVersion:1,version:'2026.10.27.1',destinations:entries,qualifications:[
  {
    "type": "PortalQualification",
    "schemaVersion": 1,
    "status": "approved",
    "destinationId": "baltimore-harbor",
    "destinationRevision": "1",
    "kind": "city",
    "contentVersion": "baltimore-portal-1",
    "renderContractVersion": "earth-main:2026.10.27.1",
    "origin": {
      "lat": 39.2904,
      "lon": -76.6122
    },
    "bounds": {
      "south": 39.26,
      "north": 39.32,
      "west": -76.65,
      "east": -76.57
    },
    "arrival": {
      "lat": 39.2904,
      "lon": -76.6122,
      "mode": "walk"
    },
    "deviceProfile": "desktop",
    "testedBuildId": "5.6.1+2d9ad8ad913d.cdf024cda84cd6e4.staging",
    "checkedAt": 1793142629766,
    "validUntil": 1800918629766,
    "evidenceId": "portal:baltimore:desktop:2026.10.27",
    "checks": {
      "geographicIdentity": "passed",
      "visualExperience": "passed",
      "safeArrival": "passed",
      "playableContent": "passed",
      "devicePerformance": "passed"
    },
    "layers": {
      "terrain": "verified",
      "transport": "verified",
      "buildings": "verified",
      "places": "verified"
    },
    "experienceIds": [
      "waterfront-exploration"
    ]
  },
  {
    "type": "PortalQualification",
    "schemaVersion": 1,
    "status": "approved",
    "destinationId": "baltimore-harbor",
    "destinationRevision": "1",
    "kind": "city",
    "contentVersion": "baltimore-portal-1",
    "renderContractVersion": "earth-main:2026.10.27.1",
    "origin": {
      "lat": 39.2904,
      "lon": -76.6122
    },
    "bounds": {
      "south": 39.26,
      "north": 39.32,
      "west": -76.65,
      "east": -76.57
    },
    "arrival": {
      "lat": 39.2904,
      "lon": -76.6122,
      "mode": "walk"
    },
    "deviceProfile": "mobile-touch",
    "testedBuildId": "5.6.1+2d9ad8ad913d.cdf024cda84cd6e4.staging",
    "checkedAt": 1793142629766,
    "validUntil": 1800918629766,
    "evidenceId": "portal:baltimore:mobile-touch:2026.10.27",
    "checks": {
      "geographicIdentity": "passed",
      "visualExperience": "passed",
      "safeArrival": "passed",
      "playableContent": "passed",
      "devicePerformance": "passed"
    },
    "layers": {
      "terrain": "verified",
      "transport": "verified",
      "buildings": "verified",
      "places": "verified"
    },
    "experienceIds": [
      "waterfront-exploration"
    ]
  }
]});
export function portalDestination(id){return PORTAL_CATALOG.destinations.find(row=>row.id===id)||null;}
export function portalSuggestions({mode='wander',homeId=null,day=Math.floor(Date.now()/86400000)}={}){
  if(mode==='home')return entries.filter(row=>row.id===homeId);
  if(mode==='together'||mode==='beyond')return [];
  const rows=mode==='nature'?entries.filter(row=>row.tags.includes('nature')):[...entries];
  const offset=((day%rows.length)+rows.length)%rows.length;
  return [...rows.slice(offset),...rows.slice(0,offset)];
}
