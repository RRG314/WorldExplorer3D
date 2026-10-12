import {AQUARIUM_GEOGRAPHY as GEO} from './aquarium-geography.js';
import {normalizeLayout,assertPlayableLayout,wallKey} from '../../../functions/interior-layout.mjs';

// Published 2013 opening dimensions (27 ft chord, 4 ft projection). The other
// openings and circulation dimensions remain estimates from the visitor route.
export const REEF_WINDOW=Object.freeze({width:27*.3048,projection:4*.3048,center:63.5,segments:24});
export function reefViewingFront(){
  const {width,projection,center,segments}=REEF_WINDOW,radius=width*width/(8*projection)+projection/2;
  const arc=Array.from({length:segments+1},(_,i)=>{const v=center-width/2+width*i/segments;return[-20-(Math.sqrt(radius*radius-(v-center)**2)-(radius-projection)),v];});
  const points=[[-20,53],[-20,55.7],[-20,56.15],[-20,58.95],...arc,[-20,68.05],[-20,70.85],[-20,71.3],[-20,74]];
  return {points,arc,curvedStart:4,curvedEnd:4+segments,flatEdges:[0,2,segments+5,segments+7]};
}

// Authored visitor topology from the institution's accessibility guide (G, 1,
// M), within the mapped Pier 3 envelope. Unmeasured dimensions are estimates.
// The habitat is NOT a room: no visitor floor or ceiling is generated over it.
export function createAquariumLayout(geoToWorld,metersPerUnit=1){
  const origin=geoToWorld(GEO.entrance.lat,GEO.entrance.lon),k=1/metersPerUnit;
  const local=(u,v)=>({x:(u*.66+v*.75)*k,z:(-u*.75+v*.66)*k});
  const envelope={footprint:GEO.footprint.map(p=>{const q=geoToWorld(p.lat,p.lon);return{x:q.x-origin.x,z:q.z-origin.z};}),heightMeters:14.5*k,revision:GEO.revision};
  const layout={schemaVersion:1,id:'baltimore-aquarium-reef-route-v1',unitLabel:'National Aquarium · Reef visit',floors:[],stairs:[],lifts:[]};
  const addFloor=(id,label,elevation,height)=>{const f={id,label,elevation:elevation*k,height:height*k,slab:.16*k,wallThickness:.32*k,vertices:{},rooms:[],doors:[],boundaries:[]};layout.floors.push(f);return f;};
  const room=(f,id,label,points)=>{const ids=points.map(([u,v])=>{const p=local(u,v);let old=Object.keys(f.vertices).find(id=>Math.hypot(f.vertices[id].x-p.x,f.vertices[id].z-p.z)<1e-5);if(!old){old=`v${Object.keys(f.vertices).length}`;f.vertices[old]=p;}return old;});const r={id,label,type:'visitor',vertices:ids};f.rooms.push(r);return r;};
  const door=(f,r,index,entry=false)=>{const a=r.vertices[index],b=r.vertices[(index+1)%r.vertices.length],p=f.vertices[a],q=f.vertices[b];f.doors.push({id:`${f.id}-door-${f.doors.length}`,wall:wallKey(a,b),offset:Math.hypot(q.x-p.x,q.z-p.z)/2,width:2.35*k,height:2.55*k,entry});};
  const glass=(f,r,index,sill=.18)=>f.boundaries.push({wall:wallKey(r.vertices[index],r.vertices[(index+1)%r.vertices.length]),presentation:'glazed',sill:sill*k});
  const g=addFloor('pavilion-g','G · Glass Pavilion',0,4);
  const arrival=room(g,'arrival','Glass Pavilion arrival',[[-7,1],[13,1],[13,17],[-7,17]]);door(g,arrival,0,true);glass(g,arrival,0);glass(g,arrival,1);glass(g,arrival,3);
  const m=addFloor('reef-m','M · Underwater viewing',4.2,3.6);
  const viewing=reefViewingFront(),front=viewing.points;
  const bay=room(m,'underwater','Blacktip Reef underwater window',[...front,[-17,74],[-17,53]]);
  const viewingEdges=[...viewing.flatEdges,...Array.from({length:REEF_WINDOW.segments},(_,i)=>viewing.curvedStart+i)];
  for(const i of viewingEdges)glass(m,bay,i,.12);
  // Public accessible corridor joins lift A to the viewing window. Private
  // offices are outside the authored route and are not fabricated rooms.
  const corridor=room(m,'reef-corridor','Accessible reef corridor',[[-39,74],[-20,74],[-17,74],[-20,78],[-25,79],[-39,79]]);door(m,bay,front.length-1);
  const l=addFloor('pavilion-1','1 · Reef overlook',8,6);
  const upper=room(l,'upper-pavilion','Pavilion overlook',[[-7,1],[13,1],[13,17],[4,17],[-6,17],[-7,17]]);glass(l,upper,0);glass(l,upper,1);
  const passage=room(l,'orientation','Blue Wonders orientation',[[-6,17],[4,17],[4,29],[-13,46],[-22,42],[-6,26]]);door(l,upper,3);
  const overlook=room(l,'overlook','Blacktip Reef overlook',[[-22,42],[-13,46],[-14,51],[-17,68],[-17,74],[-20,78],[-25,79],[-39,79],[-39,74],...front.slice().reverse(),[-27,47]]);door(l,passage,3);
  // The visitor side remains outside the habitat at both elevations.
  for(let i=9;i<9+front.length-1;i++)l.boundaries.push({wall:wallKey(overlook.vertices[i],overlook.vertices[(i+1)%overlook.vertices.length]),presentation:'guard',sill:.12*k,height:1.15*k});

  const stop=(floorId,roomId,u,v,yaw)=>({floorId,roomId,...local(u,v),yaw});
  const shaft={width:2.3*k,depth:1.6*k,landingDistance:.9*k,doorWidth:1.3*k,doorHeight:2.3*k};
  const axisYaw=Math.atan2(.75,.66);
  layout.lifts=[{id:'pavilion-lift',label:'Pavilion elevator',shaft:{...shaft},stops:[stop(g.id,arrival.id,10,13,axisYaw-Math.PI),stop(l.id,upper.id,10,13,axisYaw-Math.PI)]},{id:'reef-lift-a',label:'Elevator A',shaft:{...shaft},stops:[stop(m.id,corridor.id,-36,76.7,axisYaw),stop(l.id,overlook.id,-36,76.7,axisYaw)]}];
  const accepted=normalizeLayout(layout,envelope);assertPlayableLayout(accepted);
  return {layout:accepted,envelope,origin,local,metersPerUnit,viewing:{...viewing,edges:viewingEdges},habitat:{floor:4.2*k,surface:8.25*k,viewingEdgeStart:2,viewingEdgeCount:front.length-1,outline:[[-51,54],[-31,48],...front,[-31,74],[-52,73]].map(([u,v])=>local(u,v)),routeCenter:local(-36,64),radiusX:9*k,radiusZ:6*k}};
}
