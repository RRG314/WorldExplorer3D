// One authored ship-local contract drives geometry, support and collisions.
// +Z bow, +X port, Y above the design waterline; metres in this model.
export const RESEARCH_DECK=Object.freeze({y:4.3,minX:-7,maxX:7,minZ:-32,maxZ:23,eyeHeight:1.7});
export const RESEARCH_STATIONS=Object.freeze([
 {id:'helm',label:'Bridge / helm',x:0,z:15,action:'Take helm'},
 {id:'chart',label:'Chart table',x:-3.5,z:10,action:'Open navigation chart'},
 {id:'lab',label:'Wet lab',x:-3.5,z:-10,action:'Record water conditions'},
 {id:'dive',label:'Dive platform',x:6.1,z:-23.4,action:'Enter water at ladder'}
].map(Object.freeze));
export const RESEARCH_SOLIDS=Object.freeze([
 {id:'port-wall',x:-5.3,z:9,w:.2,l:20,h:3.1},
 {id:'starboard-wall',x:5.3,z:9,w:.2,l:20,h:3.1},
 {id:'bridge-front',x:0,z:19,w:10.6,l:.2,h:3.1},
 {id:'door-port',x:-3.35,z:-1,w:3.9,l:.2,h:3.1},
 {id:'door-starboard',x:3.35,z:-1,w:3.9,l:.2,h:3.1},
 {id:'helm-console',x:0,z:17,w:5.8,l:1.1,h:1.1},
 {id:'chart-table',x:-3.5,z:12,w:2.1,l:1.2,h:1.0},
 {id:'lab-back-wall',x:-3.5,z:-13.6,w:4.2,l:.2,h:3.1},
 {id:'lab-port-wall',x:-5.5,z:-12.4,w:.2,l:2.4,h:3.1},
 {id:'lab-starboard-wall',x:-1.5,z:-12.4,w:.2,l:2.4,h:3.1},
 {id:'lab-bench',x:-3.5,z:-12,w:3.2,l:1.2,h:1.0},
 {id:'sample-locker',x:-5.4,z:-18,w:1.2,l:2.6,h:1.4},
 {id:'crane-base',x:3.68,z:-19.5,w:.65,l:.65,h:3.2}
].map(Object.freeze));
export function researchDeckCollision(x,z,radius=.32,baseY=RESEARCH_DECK.y,height=1.7) {
 if(x<RESEARCH_DECK.minX+radius||x>RESEARCH_DECK.maxX-radius||z<RESEARCH_DECK.minZ+radius||z>RESEARCH_DECK.maxZ-radius)return true;
 return RESEARCH_SOLIDS.some(s=>Math.abs(x-s.x)<s.w*.5+radius&&Math.abs(z-s.z)<s.l*.5+radius&&baseY<RESEARCH_DECK.y+s.h&&baseY+height>RESEARCH_DECK.y);
}
export function moveOnResearchDeck(position,dx,dz) {
 const result={...position};
 const distance=Math.hypot(dx,dz);
 if(!Number.isFinite(distance)||distance>20)return result;
 const steps=Math.max(1,Math.ceil(distance/.15));
 // Swept substeps and axis sliding prevent thin-wall tunnelling.
 for(let i=0;i<steps;i++){
  if(!researchDeckCollision(result.x+dx/steps,result.z))result.x+=dx/steps;
  if(!researchDeckCollision(result.x,result.z+dz/steps))result.z+=dz/steps;
 }
 return result;
}
export function researchStationDistance(position,id) {
 const station=RESEARCH_STATIONS.find(s=>s.id===id);
 return station?Math.hypot(position.x-station.x,position.z-station.z):Infinity;
}
