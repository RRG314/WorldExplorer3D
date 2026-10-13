import {RESEARCH_STATIONS} from './interior-plan.js';
export const RCRV_LAYOUT = Object.freeze({
 floorY:1.944,spawn:Object.freeze({x:3,y:1.944,z:-30.5,yaw:0}),
 ladder:Object.freeze({x:8.3,z:-30.7,y:1.944}),stations:RESEARCH_STATIONS
});
export const RESEARCH_EYE_HEIGHT=1.7;
export function researchStationDistance(position,id){
 const s=RCRV_LAYOUT.stations.find(s=>s.id===id);
 return s&&position?Math.hypot(position.x-s.x,position.z-s.z,(position.y??RCRV_LAYOUT.floorY)-s.y):Infinity;
}
