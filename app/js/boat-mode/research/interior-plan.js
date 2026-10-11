// Game arrangement fitted inside the licensed RCRV envelope. Metres in the
// vessel frame: +Z bow, +Y up. This is not the commissioned ship's deck plan.
const freeze = values => Object.freeze(values.map(Object.freeze));
export const RESEARCH_DECKS = freeze([
 {id:'main',label:'Main deck',y:1.944},
 {id:'equipment',label:'Stair landing',y:5.48},
 {id:'crew',label:'Crew deck',y:8.83},
 {id:'bridge',label:'Bridge deck',y:12.17}
]);
export const RESEARCH_ROOMS = freeze([
 {id:'lab',label:'Wet lab',deck:'main',x0:1.3,x1:6.5,z0:-17.5,z1:-10,doorZ:-13},
 {id:'galley',label:'Galley',deck:'main',x0:-6.5,x1:-1.3,z0:-17.5,z1:-10,doorZ:-13},
 {id:'mess',label:'Mess & lounge',deck:'main',x0:-6.5,x1:-1.3,z0:-9.8,z1:-3,doorZ:-6},
 {id:'drylab',label:'Dry lab',deck:'main',x0:1.3,x1:6.5,z0:-9.8,z1:-3,doorZ:-6},
 {id:'quarters',label:'Crew quarters',deck:'crew',x0:-6.3,x1:-2.55,z0:5,z1:11.5,doorZ:6},
 {id:'briefing',label:'Briefing room',deck:'crew',x0:-6.3,x1:6.3,z0:12,z1:17,doorZ:14},
 {id:'bridge',label:'Wheelhouse',deck:'bridge',x0:-6.5,x1:6.5,z0:3.4,z1:14.7}
]);
export const RESEARCH_STATIONS = freeze([
 {id:'helm',room:'bridge',deck:'bridge',label:'Bridge helm',x:0,y:12.17,z:12,action:'Take helm'},
 {id:'chart',room:'bridge',deck:'bridge',label:'Chart table · bridge',x:4.3,y:12.17,z:8,action:'Open navigation chart'},
 {id:'lab',room:'lab',deck:'main',label:'Wet lab',x:4,y:1.944,z:-13,action:'Record water conditions'},
 {id:'galley',room:'galley',deck:'main',label:'Galley',x:-4,y:1.944,z:-13,action:'Use carried provisions'},
 {id:'mess',room:'mess',deck:'main',label:'Mess & lounge',x:-2.6,y:1.944,z:-6,action:'Open expedition Journal'},
 {id:'drylab',room:'drylab',deck:'main',label:'Dry lab',x:4,y:1.944,z:-6,action:'Review research Journal'},
 {id:'quarters',room:'quarters',deck:'crew',label:'Crew quarters',x:-4,y:8.83,z:6,action:'Save voyage checkpoint'},
 {id:'briefing',room:'briefing',deck:'crew',label:'Briefing room',x:3.7,y:8.83,z:14,action:'Open Field Guide'},
 {id:'sub',room:'working-deck',deck:'main',label:'Submarine cradle',x:-1.8,y:1.944,z:-31.5,action:'Deploy submarine'},
 {id:'dive',room:'working-deck',deck:'main',label:'Dive ladder',x:7,y:1.944,z:-30.7,action:'Enter water at ladder'}
]);
export function researchDeckAt(p){return RESEARCH_DECKS.reduce((a,b)=>Math.abs(p.y-a.y)<=Math.abs(p.y-b.y)?a:b);}
export function researchRoomAt(p){
 const deck=researchDeckAt(p);
 if(Math.abs(p.y-deck.y)>.25)return {id:'stairs',label:'Companionway',deck:deck.id};
 return RESEARCH_ROOMS.find(r=>r.deck===deck.id&&p.x>r.x0&&p.x<r.x1&&p.z>r.z0&&p.z<r.z1)||{id:p.z< -18?'working-deck':'passage',label:p.z< -18?'Working deck':'Passage & stairs',deck:deck.id};
}
// The same openings are used by the reproducible asset adaptation and the
// navigation tests. Exterior hull below the waterline is never cut.
export const RESEARCH_HULL_CUTS = freeze([
 {min:[-6.7,1.85,-17.8],max:[6.7,4.98,17]},
 {min:[-1.05,1.90,-19.4],max:[1.05,4.5,-17.5]},
 {min:[-2.4,1.85,4.95],max:[2.4,12.3,10.8]},
 {min:[-6.35,8.8,3.8],max:[6.35,11.6,17.1]},
 {min:[-6.5,12.15,3.5],max:[6.5,14.8,10.5]},
 {min:[-3.4,12.15,10.4],max:[3.4,14.8,14.5]}
]);

export function researchRouteGraph(){
 const nodes=[],edges=[];
 const add=(id,x,y,z)=>{nodes.push({id,x,y,z});return id;};
 const link=(a,b)=>edges.push([a,b]);const y=RESEARCH_DECKS[0].y;
 const corridor=[-30.5,-27.5,-20,-17,-13,-6,0,3.8];
 corridor.forEach((z,i)=>{add(`main-${i}`,0,y,z);if(i)link(`main-${i-1}`,`main-${i}`);});
 add('spawn',3,y,-30.5);link('spawn','main-0');
 for(const s of RESEARCH_STATIONS.filter(s=>s.deck==='main')){
  add(s.id,s.x,s.y,s.z);
  if(s.id==='sub')link(s.id,'main-0');else if(s.id==='dive')link(s.id,'spawn');else link(s.id,s.z===-13?'main-4':'main-5');
 }
 let previous='main-7';
 for(let i=0;i<3;i++){
  const low=RESEARCH_DECKS[i].y,high=RESEARCH_DECKS[i+1].y,mid=(low+high)/2;
  for(const [j,x,y,z] of [[0,-1.15,low,4.3],[1,-1.15,low,5],[2,-1.15,mid,8.9],[3,-1.15,mid,9.7],[4,1.15,mid,9.7],[5,1.15,mid,8.9],[6,1.15,high,5],[7,1.15,high,4.3],[8,0,high,4.3]]){
   const id=add(`stairs-${i}-${j}`,x,y,z);link(previous,id);previous=id;
  }
  if(i<2){const id=add(`landing-${i}`,0,high,3.8);link(previous,id);previous=id;}
 }
 for(const deck of ['crew','bridge']){
  const y=RESEARCH_DECKS.find(d=>d.id===deck).y,base=deck==='crew'?'landing-1':'stairs-2-8';
  // Walk around the stair enclosure through its forward passage.
  let prev=base;
  for(const [id,x,z] of [['aft',3.3,4.3],['side',3.3,11.2],['forward',deck==='crew'?3.7:3,12]]){const key=add(`${deck}-${id}`,x,y,z);link(prev,key);prev=key;}
  for(const s of RESEARCH_STATIONS.filter(s=>s.deck===deck)){add(s.id,s.x,s.y,s.z);if(s.id==='quarters'){
   const a=add('crew-port',-4,y,4.1);link(base,a);const b=add('quarters-door',-4,y,5.6);link(a,b);link(b,s.id);
  }else link(s.id,s.id==='chart'?`${deck}-aft`:`${deck}-forward`);}
 }
 return {nodes,edges};
}
