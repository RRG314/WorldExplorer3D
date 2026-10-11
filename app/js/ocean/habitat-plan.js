import {oceanTileCoordinate} from './stream-grid.js';
export const CORAL_SHELF_SITE=Object.freeze({lat:-18.2861,lon:147.7});
export const MARINE_CONTENT_VERSION=2;
export function marineStudyOffset(site,scale=100000){
 const featured=Number.isFinite(site?.lat)&&Number.isFinite(site?.lon)&&Math.abs(site.lat-CORAL_SHELF_SITE.lat)<.025&&Math.abs(site.lon-CORAL_SHELF_SITE.lon)<.025;
 return {featured,x:featured?(CORAL_SHELF_SITE.lon-site.lon)*scale*Math.cos(site.lat*Math.PI/180):0,z:featured?(site.lat-CORAL_SHELF_SITE.lat)*scale:0};
}
function randomFor(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function createMarineHabitatPlan({site,scale=100000,sampleSeabedHeight,includeAuthoredStudy=true}){
 const offset=includeAuthoredStudy?marineStudyOffset(site,scale):{featured:false,x:0,z:0},featured=offset.featured;
 const seed=featured?81450:Math.round((site?.lat||0)*10000)^Math.round((site?.lon||0)*10000);
 const random=randomFor(seed);
 const rocks=[],corals=[],grass=[],landmarks=[],contacts=[];
 const centers=[[-38,66],[36,112],[-46,157],[92,178],[-103,118],[69,228],[-90,244],[132,86]];
 if(featured)for(let patch=0;patch<centers.length;patch++){
  const random=randomFor(81450+patch*997);
  const [cx,cz]=centers[patch],x=cx+offset.x,z=cz+offset.z,y=sampleSeabedHeight(x,z);
  if(!Number.isFinite(y)||y> -4||Math.hypot(x,z)>950)continue;
  const radius=5.5+random()*3,height=1.4+random()*1.8;
  if(patch<3)landmarks.push({id:['table-garden','branch-ridge','seagrass-edge'][patch],label:['Table Garden','Branch Ridge','Seagrass Edge'][patch],x,y:y+height,z,truthType:'authored'});
  rocks.push({id:`reef-foundation-${patch}`,x,y:y-.7,z,rx:radius,ry:height,rz:radius*.8,tint:patch%3});
  for(let i=0;i<24;i++){
   const angle=random()*Math.PI*2,r=Math.sqrt(random())*.82,px=x+Math.cos(angle)*r*radius,pz=z+Math.sin(angle)*r*radius*.8;
   const cy=y-.7+height*Math.sqrt(1-r*r)-.10;
   corals.push({id:`coral-${patch}-${i}`,kind:['table-coral','branch-coral','massive-coral'][i%4<2?patch%3:i%3],x:px,y:cy,z:pz,yaw:random()*Math.PI*2,scale:.48+random()*.88,tint:Math.floor(random()*6)});
  }
  for(let i=0;i<18;i++){
   const angle=random()*Math.PI*2,r=radius+3+random()*12,px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;
   const gy=sampleSeabedHeight(px,pz),yaw=random()*Math.PI*2,gs=.5+random()*.6;
   if(Number.isFinite(gy)&&gy< -3)grass.push({x:px,y:gy,z:pz,yaw,scale:gs});
  }
 }
 // Authored investigation objects are anchored to this geographic study,
 // not to the current boat launch. No historical discovery is implied.
 if(featured){
  const habitat=landmarks[0];
  if(habitat)contacts.push({id:'habitat',code:'C1',kind:'habitat',x:habitat.x,y:habitat.y+1,z:habitat.z,radius:9,returnShape:'Broad, irregular return',evidence:'Branching colonies spread over a rocky base.',conclusion:'A living reef habitat on rock'});
  const x=offset.x-3,z=offset.z+92,y=sampleSeabedHeight(x,z);
  if(Number.isFinite(y)&&y< -5&&Math.hypot(x,z)<950){
   rocks.push({id:'study-outcrop',x,y:y-.4,z,rx:6,ry:3,rz:4,tint:1});
   contacts.push({id:'rock',code:'C2',kind:'rock',x,y:y+2.6,z,radius:6,returnShape:'Compact, uneven return',evidence:'An unbroken mineral surface, with no panels or branching colonies.',conclusion:'A natural rock outcrop'});
  }
  const ax=offset.x+23,az=offset.z+60,ay=sampleSeabedHeight(ax,az);
  if(Number.isFinite(ay)&&ay< -5&&Math.hypot(ax,az)<950)contacts.push({id:'case',code:'C3',kind:'case',x:ax,y:ay+.4,z:az,baseY:ay,radius:1,returnShape:'Small, sharply bounded return',evidence:'Straight edges, latches and a manufactured protective case.',conclusion:'A modern research equipment case'});
 }
 // Sparse sediment/outcrop fallback is deliberate: unknown oceans are not
 // carpeted with tropical coral or falsely labeled as a mapped habitat.
 for(let i=0;i<(featured?65:95);i++){
  const angle=random()*Math.PI*2,r=70+Math.sqrt(random())*520,x=Math.cos(angle)*r+offset.x,z=Math.sin(angle)*r+offset.z,y=sampleSeabedHeight(x,z);
  const size=.6+random()*2.6;
  if(!Number.isFinite(y)||y> -3||Math.hypot(x,z)>1100)continue;
  rocks.push({id:`outcrop-${i}`,x,y:y-.3,z,rx:size*1.8,ry:size*.6,rz:size,tint:i%3});
 }
 return {id:featured?'coral-shelf-study-v1':'sediment-outcrop-v1',version:MARINE_CONTENT_VERSION,featured,truthType:'authored',label:featured?'Coral Shelf · authored habitat':'Authored sediment · habitat unverified',offset,rocks,corals,grass,landmarks,contacts};
}
export function marineHabitatCollision(plan,point,radius=.4){
 if(!plan||!point)return false;
 for(const r of plan.rocks){const d=((point.x-r.x)/(r.rx+radius))**2+((point.z-r.z)/(r.rz+radius))**2+((point.y-r.y)/(r.ry+radius))**2;if(d<1)return true;}
 for(const c of plan.contacts||[])if(c.kind==='case'&&Math.abs(point.x-c.x)<.85+radius&&Math.abs(point.z-c.z)<.85+radius&&Math.abs(point.y-c.y)<.6+radius)return true;
 for(const c of plan.corals)if(Math.abs(point.y-(c.y+c.scale))<c.scale+radius&&Math.hypot(point.x-c.x,point.z-c.z)<c.scale*.65+radius)return true;
 return false;
}

// World-addressed scenery: a tile generates the same outcrops regardless of
// render origin or arrival direction. Keep only nearby instances; no save data.
export function createStreamedMarineHabitatPlan({tiles,frame,focus,sampleSeabedHeight}){
 const rocks=[];
 for(const tile of tiles){
  let seed=2166136261;for(const c of tile.key){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619);}
  const random=randomFor(seed);
  for(let i=0;i<96;i++){
   const geo=oceanTileCoordinate(tile,random(),random()),point=frame.toWorld(geo.lat,geo.lon),size=.6+random()*2.6;
   const range=Math.hypot(point.x-focus.x,point.z-focus.z);if(range>650)continue;
   const y=sampleSeabedHeight(point.x,point.z);if(!Number.isFinite(y)||y> -3)continue;
   rocks.push({id:`${tile.key}:outcrop-${i}`,x:point.x,y:y-.3,z:point.z,rx:size*1.8,ry:size*.6,rz:size,tint:i%3,range});
  }
 }
 rocks.sort((a,b)=>a.range-b.range||a.id.localeCompare(b.id));
 return {id:'geographic-sediment-v1',version:MARINE_CONTENT_VERSION,featured:false,truthType:'authored',label:'Seabed exploration',offset:{x:0,z:0},rocks:rocks.slice(0,128),corals:[],grass:[],landmarks:[],contacts:[]};
}
