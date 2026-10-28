// Factual reference register, NOT a list of released playable track packs.
// Sources describe layouts; they do not license their maps, logos or artwork.
// Exact geographic surveys, surface support and play evidence belong to each
// versioned pack before an entry can be admitted to the racing runtime.
const rows=[
 {id:'nurburgring-nordschleife',name:'Nürburgring',layout:'Full Nordschleife · T13 timing line',group:'circuit',country:'Germany',lengthMeters:20832,surfaces:['asphalt'],
  source:'https://www.nuerburgring.de/info/nuerburgring/race-tracks/nordschleife',layoutSource:'https://nuerburgring.de/info/nuerburgring/records',
  requirements:['long-course','vertical-separation','surveyed-cambers','sector-timing'],note:'Full lap, separate from tourist bridge-to-gantry timing, GP circuit and combined endurance layouts.'},
 {id:'silverstone-grand-prix',name:'Silverstone',layout:'Grand Prix circuit',group:'circuit',country:'United Kingdom',lengthMeters:5891,surfaces:['asphalt'],
  source:'https://www.formula1.com/en/racing/2026/great-britain',requirements:['kerbs-and-runoff','pit-lane','sector-timing'],note:'Grand Prix layout; National and International configurations need separate identities.'},
 {id:'spa-grand-prix',name:'Spa-Francorchamps',layout:'Grand Prix circuit',group:'circuit',country:'Belgium',lengthMeters:7004,surfaces:['asphalt'],
  source:'https://www.formula1.com/en/information/belgium-circuit-de-spa-francorchamps.3LltuYaAXVRU8iezEsjzGw',requirements:['surveyed-cambers','kerbs-and-runoff','pit-lane','sector-timing'],note:'Elevation and crest support must match the surveyed course; a flat outline is insufficient.'},
 {id:'monza-grand-prix',name:'Monza',layout:'Grand Prix circuit',group:'circuit',country:'Italy',lengthMeters:5793,surfaces:['asphalt'],
  source:'https://www.monzanet.it/en/circuit/',requirements:['vertical-separation','kerbs-and-runoff','pit-lane','sector-timing'],note:'Current road circuit, not the historic banked oval. Preserve park geography and underpass separation.'},
 {id:'daytona-tri-oval',name:'Daytona International Speedway',layout:'2.5-mile tri-oval',group:'oval',country:'United States',lengthMeters:4023.36,surfaces:['asphalt'],bankingMaxDegrees:31,
  source:'https://www.daytonainternationalspeedway.com/about-daytona-international-speedway/',requirements:['high-banking','oval-starts','pit-lane','oval-flags'],note:'Oval, not the infield sports-car course. Lake Lloyd must remain outside the racing surface.'},
 {id:'indianapolis-oval',name:'Indianapolis Motor Speedway',layout:'2.5-mile oval',group:'oval',country:'United States',lengthMeters:4023.36,surfaces:['asphalt'],
  source:'https://www.indianapolismotorspeedway.com/events/indy500/event-info/open-test',requirements:['surveyed-cambers','oval-starts','pit-lane','oval-flags'],note:'Oval identity; the road course requires a separate pack and timing rules.'},
 {id:'talladega-tri-oval',name:'Talladega Superspeedway',layout:'2.66-mile tri-oval',group:'oval',country:'United States',lengthMeters:4280.97024,surfaces:['asphalt'],bankingMaxDegrees:33,
  source:'https://www.talladegasuperspeedway.com/track-facts/',requirements:['high-banking','oval-starts','pit-lane','oval-flags'],note:'Survey apron, pit entry and banking transitions; do not simulate a flat generic ellipse.'},
 {id:'bristol-concrete-oval',name:'Bristol Motor Speedway',layout:'0.533-mile concrete oval',group:'oval',country:'United States',lengthMeters:857.794752,surfaces:['concrete'],bankingMaxDegrees:28,
  source:'https://www.bristolmotorspeedway.com/media/',requirements:['high-banking','oval-starts','pit-lane','oval-flags'],note:'Concrete oval with variable banking; dirt conversions are separate layouts.'},
 {id:'turini-2026-bollene-moulinet',name:'Col de Turini',layout:'La Bollène-Vésubie → Moulinet · 2026 stage',group:'rally',country:'France',lengthMeters:23450,surfaces:['asphalt','snow-ice'],
  source:'https://acm.mc/racefeed/es15-la-bollene-vesubie-moulinet-1/',requirements:['long-course','stage-starts','pace-notes','mixed-grip','stage-recovery'],note:'23.45 km event stage, not the separate Historique regularity route. Conditions must be versioned.'},
 {id:'ouninpohja-2025-stage',name:'Ouninpohja',layout:'2025 special stage',group:'rally',country:'Finland',lengthMeters:23980,surfaces:['gravel'],
  source:'https://sectorallyfinland.fi/wp-content/uploads/2025/03/SRF25-RG1_A4_FINAL_200325-1.pdf',requirements:['long-course','stage-starts','pace-notes','loose-surface','jumps','stage-recovery'],note:'Historical 2025 layout. Do not label it as part of the 2026 event or infer its route from the stage name.'},
 {id:'fafe-2026-stage',name:'Fafe',layout:'2026 special stage',group:'rally',country:'Portugal',lengthMeters:11180,surfaces:['gravel'],
  source:'https://www.rallydeportugal.pt/content.aspx?eid=15739&idioma=1&menuid=2',requirements:['long-course','stage-starts','pace-notes','loose-surface','jumps','stage-recovery'],note:'Stage includes the Pedra Sentada jump; jumping, landing and route recovery need explicit acceptance.'},
 {id:'umea-2026-stage',name:'Umeå',layout:'2026 full-length special stage',group:'rally',country:'Sweden',lengthMeters:10230,surfaces:['snow-ice'],
  source:'https://toyotagazooracing.com/wrc/release/2026/rd02-preview/',layoutSource:'https://www.wrc.com/en/news/stage-guide-wrc-rally-sweden-2026',requirements:['long-course','stage-starts','pace-notes','mixed-grip','jumps','stage-recovery'],note:'Full stage, distinct from Umeå Sprint and the shakedown. Snow banks and studded-surface handling are required.'}
];
export const RACE_VENUE_CATALOG=Object.freeze(rows.map(row=>Object.freeze({...row,version:1,factsCheckedAt:'2026-10-28',status:'researched',
 surfaces:Object.freeze(row.surfaces),requirements:Object.freeze(row.requirements),contentRights:'not-cleared',playablePack:null})));
export function raceVenueById(id){return RACE_VENUE_CATALOG.find(v=>v.id===id)||null;}
export function racingVenueCoverage(){return Object.fromEntries(['circuit','oval','rally'].map(group=>[group,
 {researched:RACE_VENUE_CATALOG.filter(v=>v.group===group).length,playable:RACE_VENUE_CATALOG.filter(v=>v.group===group&&v.status==='playable').length}]))}
