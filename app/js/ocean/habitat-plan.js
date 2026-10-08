export const CORAL_SHELF_SITE=Object.freeze({lat:-18.2861,lon:147.7});
export const MARINE_CONTENT_VERSION=1;
function randomFor(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function createMarineHabitatPlan({site,scale=100000,sampleSeabedHeight}){
 const featured=Number.isFinite(site?.lat)&&Number.isFinite(site?.lon)&&Math.abs(site.lat-CORAL_SHELF_SITE.lat)<.025&&Math.abs(site.lon-CORAL_SHELF_SITE.lon)<.025;
 const seed=featured?81450:Math.round((site?.lat||0)*10000)^Math.round((site?.lon||0)*10000);
 const random=randomFor(seed),offset=featured?{x:(CORAL_SHELF_SITE.lon-site.lon)*scale*Math.cos(site.lat*Math.PI/180),z:(site.lat-CORAL_SHELF_SITE.lat)*scale}:{x:0,z:0};
 const rocks=[],corals=[],grass=[],landmarks=[];
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
 // Sparse sediment/outcrop fallback is deliberate: unknown oceans are not
 // carpeted with tropical coral or falsely labeled as a mapped habitat.
 for(let i=0;i<(featured?65:95);i++){
  const angle=random()*Math.PI*2,r=70+Math.sqrt(random())*520,x=Math.cos(angle)*r+offset.x,z=Math.sin(angle)*r+offset.z,y=sampleSeabedHeight(x,z);
  if(!Number.isFinite(y)||y> -3||Math.hypot(x,z)>1100)continue;
  const size=.6+random()*2.6;rocks.push({id:`outcrop-${i}`,x,y:y-.3,z,rx:size*1.8,ry:size*.6,rz:size,tint:i%3});
 }
 return {id:featured?'coral-shelf-study-v1':'sediment-outcrop-v1',version:MARINE_CONTENT_VERSION,featured,truthType:'authored',label:featured?'Coral Shelf · authored habitat':'Authored sediment · habitat unverified',offset,rocks,corals,grass,landmarks};
}
export function marineHabitatCollision(plan,point,radius=.4){
 if(!plan||!point)return false;
 for(const r of plan.rocks){const d=((point.x-r.x)/(r.rx+radius))**2+((point.z-r.z)/(r.rz+radius))**2+((point.y-r.y)/(r.ry+radius))**2;if(d<1)return true;}
 for(const c of plan.corals)if(Math.abs(point.y-(c.y+c.scale))<c.scale+radius&&Math.hypot(point.x-c.x,point.z-c.z)<c.scale*.65+radius)return true;
 return false;
}
