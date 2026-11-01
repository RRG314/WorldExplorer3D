import {Vector3} from 'three';
import {FOUR_DIAL_INSTRUMENT_LAYOUT} from '../../app/js/transport/vehicle-instruments.js';

// The source recipe validates archive/files before this helper is called. Keep
// the original small gauge geometry out of the whole-car simplification budget;
// restore its caps with UVs for the existing instance-owned telemetry display.
export function captureE46InstrumentFaces(nodes){
 const matches=nodes.filter(n=>/(?:^|\/)Object_196(?:\/|$)/.test(n.getExtras().sourcePart||''));
 if(matches.length!==1)throw Error('E46 source gauge identity changed');
 const node=matches[0],primitives=node.getMesh().listPrimitives();
 if(primitives.length!==1||primitives[0].getMaterial()?.getName()!=='Int_glossy')throw Error('E46 source gauge material changed');
 const primitive=primitives[0],position=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
 if(position.getCount()!==164||indices?.getCount()!==864)throw Error('E46 source gauge topology changed');
 return {node,material:primitive.getMaterial(),indices:indices.getArray().slice(),attributes:primitive.listSemantics().map(semantic=>{
  const a=primitive.getAttribute(semantic);return {semantic,type:a.getType(),array:a.getArray().slice()};
 })};
}
export function restoreE46InstrumentFaces(doc,snapshot,placeholder){
 const root=doc.getRoot(),buffer=root.listBuffers()[0],attributes=new Map(snapshot.attributes.map(a=>[a.semantic,doc.createAccessor().setType(a.type).setBuffer(buffer).setArray(a.array)])),
  position=attributes.get('POSITION'),points=Array.from({length:position.getCount()},(_,i)=>new Vector3(...position.getElement(i,[]))),parent=points.map((_,i)=>i);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<snapshot.indices.length;i+=3){const a=find(snapshot.indices[i]);for(let j=1;j<3;j++)parent[find(snapshot.indices[i+j])]=a;}
 const groups=new Map();for(let i=0;i<points.length;i++){const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 if(groups.size!==4)throw Error('E46 source no longer has four separate gauge bodies');
 const up=new Vector3(0,.970631,.240573).normalize(),gauges=[...groups.values()].map(vertices=>{
  const xs=vertices.map(i=>points[i].x),ys=vertices.map(i=>points[i].dot(up));
  return {vertices,x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,r:(Math.max(...xs)-Math.min(...xs))/2};
 }).sort((a,b)=>b.x-a.x),uv=new Float32Array(points.length*2),front=[],body=[];
 for(let index=0;index<gauges.length;index++){
  const gauge=gauges[index],atlas=FOUR_DIAL_INSTRUMENT_LAYOUT[index];
  if(!(gauge.r>.008&&gauge.r<.035))throw Error('E46 gauge scale changed');
  for(const i of gauge.vertices){uv[i*2]=(atlas.x-(points[i].x-gauge.x)*atlas.r/gauge.r)/512;uv[i*2+1]=(atlas.y-(points[i].dot(up)-gauge.y)*atlas.r/gauge.r)/256;}
 }
 for(let i=0;i<snapshot.indices.length;i+=3){const tri=Array.from(snapshot.indices.slice(i,i+3)),[a,b,c]=tri.map(j=>points[j]),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  (normal.z<-.8?front:body).push(...tri);
 }
 if(front.length!==576||body.length!==288)throw Error('E46 gauge cap orientation changed');
 const index=values=>doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(values));
 const base=doc.createPrimitive().setMaterial(snapshot.material).setIndices(index(body));for(const [semantic,a]of attributes)base.setAttribute(semantic,a);
 snapshot.node.setMesh(doc.createMesh('Original E46 gauge bodies').addPrimitive(base));
 const display=doc.createMaterial('E46_Original_Gauge_Faces').setBaseColorFactor([1,1,1,1]).setEmissiveFactor([1,1,1]).setRoughnessFactor(.8).setDoubleSided(true).setBaseColorTexture(placeholder),
  faces=base.clone().setIndices(index(front)).setMaterial(display).setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setBuffer(buffer).setArray(uv)),
  node=doc.createNode('Original E46 four gauge faces').setMesh(doc.createMesh('E46 four dial display').addPrimitive(faces));
 node.setExtras({vehicleInstrumentDisplay:true,vehicleInstrumentStyle:'four-dial'});root.listScenes()[0].addChild(node);
 return {gauges:gauges.length,sourceTriangles:288,displayTriangles:192};
}
