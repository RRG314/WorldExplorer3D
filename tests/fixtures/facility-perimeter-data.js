import {compileTransportFacilityGraph} from '../../app/js/transport/facility-compiler.js';
export function perimeterSource(location={lat:0,lon:0}) {
  const elements=[];let id=0;
  function node(x,z,tags={}) {const item={type:'node',id:++id,lat:location.lat-z/100000,lon:location.lon+x/(100000*Math.cos(location.lat*Math.PI/180)),tags};elements.push(item);return item.id;}
  function way(points,tags) {const nodes=points.map(p=>node(...p));if(points.length>2 && points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])nodes[nodes.length-1]=nodes[0];elements.push({type:'way',id:++id,nodes,tags});}
  way([[-100,-50],[100,-50],[100,100],[-100,100],[-100,-50]],{aeroway:'aerodrome'});
  way([[-90,0],[90,0]],{barrier:'fence',height:'2.5',fence_type:'chain_link'});
  node(-45,0,{barrier:'gate',width:'6'});
  way([[0,-40],[0,80]],{highway:'service',width:'8'});
  way([[50,-40],[50,80]],{aeroway:'taxiway',width:'14'});
  way([[-90,250],[90,250]],{barrier:'fence'});
  return {elements};
}

export function perimeterFixture() {
  return compileTransportFacilityGraph(perimeterSource(),{location:{lat:0,lon:0}});
}
