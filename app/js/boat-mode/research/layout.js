// Metre-scale game adaptation of OSU's licensed RCRV educational model.
// These are action approaches, not mesh origins. Geometry remains the floor and
// wall authority. A deck control station avoids claiming an invented bridge interior.
export const RCRV_LAYOUT = Object.freeze({
  floorY: 1.944, spawn: Object.freeze({x:3,y:1.944,z:-30.5,yaw:0}),
  ladder: Object.freeze({x:8.3,z:-30.7,y:1.944}),
  stations: Object.freeze([
    {id:'helm',label:'Deck helm',x:0,y:1.944,z:-26.5,action:'Take helm'},
    {id:'chart',label:'Navigation chart',x:3,y:1.944,z:-30.3,action:'Open navigation chart'},
    {id:'lab',label:'Wet lab · science van',x:6,y:1.985,z:-23.5,action:'Record water conditions'},
    {id:'sub',label:'Submarine cradle',x:-1.8,y:1.944,z:-31.5,action:'Deploy submarine'},
    {id:'dive',label:'Dive ladder',x:7,y:1.944,z:-30.7,action:'Enter water at ladder'}
  ].map(Object.freeze))
});

export const RESEARCH_EYE_HEIGHT = 1.7;
export function researchStationDistance(position,id) {
 const station=RCRV_LAYOUT.stations.find(s=>s.id===id);
 return station&&position?Math.hypot(position.x-station.x,position.z-station.z,(position.y??RCRV_LAYOUT.floorY)-station.y):Infinity;
}
