import {VAB_SURVEY} from './kennedy-site-survey.js';

export const VAB_ID='way/26929904';
export const VAB_NORTH={lat:28.586714,lon:-80.6511749};
export function isVehicleAssemblyBuilding(building={}){
 const tags=building.tags||{};
 return [building.sourceBuildingId,building.id,tags._sourceFeatureId,building.metadataSourceId,
  building.buildingProvenance?.metadata?.stable?building.buildingProvenance.metadata.sourceFeatureId:null]
  .some(id=>/^(?:osm:)?(?:way[/:]|osm-way:)?26929904$/.test(String(id||'')));
}
export function vabFrame(ctx){
 const north=ctx.geoToWorld(VAB_NORTH.lat,VAB_NORTH.lon),east=ctx.geoToWorld(28.5868777,-80.6503929);
 const length=Math.hypot(east.x-north.x,east.z-north.z),ux=(east.x-north.x)/length,uz=(east.z-north.z)/length;
 const k=1/(ctx.METERS_PER_WORLD_UNIT||1),sx=-uz,sz=ux;
 const center={x:north.x+sx*67.36*k,z:north.z+sz*67.36*k};
 return {center,k,ux,uz,sx,sz,world:(x,z)=>({x:center.x+(ux*x+sx*z)*k,z:center.z+(uz*x+sz*z)*k}),local:p=>({x:((p.x-center.x)*ux+(p.z-center.z)*uz)/k,z:((p.x-center.x)*sx+(p.z-center.z)*sz)/k})};
}
const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lon<(b.lon-a.lon)*(p.lat-a.lat)/(b.lat-a.lat)+a.lon)hit=!hit;
}return hit;};
// A small reviewed survey replaces only contained VAB representations. Keep
// neighboring facilities, roads and the launch control centre under their owners.
export function prepareKennedyBuildingWays(ctx,ways,nodes,radius){
 const p=ctx.geoToWorld(VAB_NORTH.lat,VAB_NORTH.lon);
 if(!Number.isFinite(radius)||Math.hypot(p.x,p.z)>radius-220)return {ways,nodes};
 const survey=VAB_SURVEY[0],nextNodes={...nodes};
 const retained=ways.filter(way=>{
  if(isVehicleAssemblyBuilding(way))return false;
  const points=(way.nodes||[]).map(id=>nodes[id]).filter(Boolean);
  return !(points.length>=3&&points.every(p=>inside(p,survey.points)||survey.points.some(s=>Math.abs(s.lat-p.lat)<1e-7&&Math.abs(s.lon-p.lon)<1e-7)));
 });
 const ids=survey.points.map((p,i)=>{const id=`reviewed-vab:${i}`;nextNodes[id]=p;return id;});
 retained.push({id:VAB_ID,nodes:ids,tags:{...survey.tags,_sourceFeatureId:VAB_ID,_geometrySource:'osm',_sourceVersion:survey.version}});
 return {ways:retained,nodes:nextNodes};
}
export function kennedyMappedEntrances(ctx){
 if(!ctx.buildings?.some(isVehicleAssemblyBuilding))return [];
 return [{id:'vab-north-visitor-approach',...ctx.geoToWorld(VAB_NORTH.lat,VAB_NORTH.lon),buildingSourceId:VAB_ID,tags:{entrance:'main',name:'Vehicle Assembly Building'}}];
}
