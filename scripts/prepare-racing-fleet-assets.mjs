// Offline derivatives of the pinned original CC0 models. Originals stay in
// SOURCE; output must be empty. No source scripts or driving code are executed.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {compactPrimitive,dedup,flatten,getBounds,join,prune,simplify,transformMesh,weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4,BoxGeometry,CylinderGeometry,Quaternion,Vector3} from 'three';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const recipes=[
 {id:'road-meridian-gt',variantId:'meridian_gt',label:'Meridian GT',file:'innerscene-gt-source.glb',
  sourceUrl:'https://www.innerscene.com/tools/library/3d-parts/generic-front-engine-grand-tourer-coupe-9a08f635',
  sourceSha256:'a84c0b8a02bd299fd21b2fccbbd2f953c567b591e74f5b7721c5bd51da6d077b',
  author:'Innerscene',yaw:Math.PI/2,paint:['paint'],
  wheel:/^(?:Original tyre|Deep wheel barrel|Machined alloy outer|Cast swept alloy spoke|Wheel bearing hub|Wheel hex lug|Visible brake disc)/,
  tire:/^Original tyre carcass and shaped sidewalls/,caliper:/^Brake caliper/,eye:[.461,1.035,.08]},
 {id:'road-apex-clubsport',variantId:'apex_clubsport',label:'Apex ClubSport',file:'apex-source.glb',
  sourceUrl:'https://www.innerscene.com/tools/library/3d-parts/generic-1990s-japanese-style-sports-coupe-ace64592',
  sourceSha256:'ea9818049852d191e795d8bc999e2e911df696c47a846418a6497d59fbb3c29f',
  author:'Innerscene',yaw:Math.PI/2,paint:['paint'],motorsport:'track',
  wheel:/^(?:Original tyre|Deep wheel barrel|Machined alloy outer|Cast swept alloy spoke|Wheel bearing hub|Wheel hex lug|Visible brake disc)/,
  tire:/^Original tyre carcass and shaped sidewalls/,caliper:/^Brake caliper/,eye:[.4224,1.01,.02]},
 {id:'road-kestrel-rally',variantId:'kestrel_rally',label:'Kestrel Rally',file:'kestrel-source.glb',
  sourceUrl:'https://www.innerscene.com/tools/library/3d-parts/generic-hot-hatch-a60561a5',
  sourceSha256:'3ce9ea2664cda82468f2568acd458f417941388be39afb7c0bf6fab109194e1f',
  author:'Innerscene',yaw:Math.PI/2,paint:['paint'],motorsport:'rally',
  wheel:/^(?:Original tyre|Deep wheel barrel|Machined alloy outer|Cast swept alloy spoke|Wheel bearing hub|Wheel hex lug|Visible brake disc)/,
  tire:/^Original tyre carcass and shaped sidewalls/,caliper:/^Brake caliper/,eye:[.4272,1.12,.22]}
];
const [sourceDir,outputDir]=process.argv.slice(2);
if(!sourceDir||!outputDir)throw Error('Usage: node scripts/prepare-racing-fleet-assets.mjs SOURCE EMPTY_OUTPUT');
await mkdir(outputDir,{recursive:true});
if((await readdir(outputDir)).length)throw Error('Output must be empty.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),records=[];
await MeshoptSimplifier.ready;
const hash=b=>createHash('sha256').update(b).digest('hex');
const triangles=d=>d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((sum,p)=>sum+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
function addMotorsportEquipment(doc,scene,kind){
 const buffer=doc.getRoot().listBuffers()[0],dark=doc.createMaterial('World Explorer competition trim').setBaseColorFactor([.025,.03,.034,1]).setRoughnessFactor(.66),
  steel=doc.createMaterial('World Explorer safety cage').setBaseColorFactor([.32,.35,.37,1]).setMetallicFactor(.55).setRoughnessFactor(.4),
  lens=doc.createMaterial('World Explorer rally lamp').setBaseColorFactor([.85,.84,.7,1]).setEmissiveFactor([.2,.19,.13]).setRoughnessFactor(.18);
 function geometry(name,g,mat,position=[0,0,0],rotation=new Quaternion()){
  const p=doc.createPrimitive().setMaterial(mat);
  for(const [key,attribute]of Object.entries(g.attributes))if(['position','normal','uv'].includes(key))p.setAttribute(key==='position'?'POSITION':key==='normal'?'NORMAL':'TEXCOORD_0',doc.createAccessor().setBuffer(buffer).setType(attribute.itemSize===2?'VEC2':'VEC3').setArray(new Float32Array(attribute.array)));
  if(g.index)p.setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(g.index.array)));
  const node=doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)).setTranslation(position).setRotation(rotation.toArray());scene.addChild(node);g.dispose();return node;
 }
 const box=(name,w,h,d,x,y,z)=>geometry(name,new BoxGeometry(w,h,d),dark,[x,y,z]);
 function beam(name,a,b){const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start);geometry(name,new CylinderGeometry(.022,.022,delta.length(),8),steel,start.add(end).multiplyScalar(.5).toArray(),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));}
 const roof=kind==='rally'?1.34:1.16,hoop=kind==='rally'?-.28:-.52;
 for(const x of [-.59,.59]){beam('Competition roll hoop upright',[x,.33,hoop],[x,roof,hoop]);beam('Rear cage stay',[x,roof,hoop],[x,.35,hoop-.8]);}
 beam('Competition roll hoop crown',[-.59,roof,hoop],[.59,roof,hoop]);beam('Competition cage diagonal',[-.59,.33,hoop],[.59,roof,hoop]);
 if(kind==='track'){
  box('ClubSport splitter',1.72,.065,.23,0,.14,2.03);
  for(const x of [-.49,.49])box('ClubSport wing pylon',.035,.32,.07,x,.86,-1.84);
  box('ClubSport rear wing',1.72,.055,.26,0,1.04,-1.84);
  for(const x of [-.85,.85])box('ClubSport wing endplate',.025,.17,.29,x,1.04,-1.84);
 }else{
  box('Rally roof vent',.34,.065,.4,0,1.481,-.06);box('Rally skid plate',1.46,.04,.38,0,.09,1.76);
  for(const x of [-.45,-.15,.15,.45]){const q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2);geometry('Rally lamp housing',new CylinderGeometry(.13,.13,.12,24),dark,[x,.75,1.99],q);geometry('Rally lamp lens',new CylinderGeometry(.112,.112,.012,24),lens,[x,.75,2.057],q);}
  for(const x of [-.81,.81])for(const z of [-1.6,.94])box('Rally mud flap',.26,.25,.018,x,.14,z);
 }
}

for(const recipe of recipes){
 const original=await readFile(path.join(sourceDir,recipe.file));
 if(hash(original)!==recipe.sourceSha256)throw Error('Unreviewed source: '+recipe.id);
 const doc=await io.readBinary(original),root=doc.getRoot(),scene=root.listScenes()[0];
 if(root.listSkins().length)throw Error('Rigid model required.');
 // The closed, authored rest pose is the drivable model. Wheel motion belongs
 // to the existing transport frame owner, not the source's showcase animations.
 for(const animation of root.listAnimations())animation.dispose();
 await doc.transform(flatten());
 const nodes=root.listNodes().filter(n=>n.getMesh()),rotation=new Matrix4().makeRotationY(recipe.yaw);
 for(const node of nodes){
  const mesh=node.getMesh().clone();node.setMesh(mesh);
  transformMesh(mesh,rotation.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix())).toArray());
  scene.addChild(node);node.setMatrix(new Matrix4().toArray());
 }
 for(const node of [...scene.listChildren()])if(!nodes.includes(node))scene.removeChild(node);
 await doc.transform(prune());
 const bounds=getBounds(scene),scale=recipe.length?recipe.length/(bounds.max[2]-bounds.min[2]):1;
 const center=[(bounds.max[0]+bounds.min[0])/2,bounds.min[1],(bounds.max[2]+bounds.min[2])/2];
 const matrix=new Matrix4().makeScale(scale,scale,scale).multiply(new Matrix4().makeTranslation(...center.map(v=>-v)));
 for(const node of nodes)transformMesh(node.getMesh(),matrix.toArray());
 for(const material of root.listMaterials()){
  if(recipe.paint.includes(material.getName()))material.setMetallicFactor(.32).setRoughnessFactor(.29);
  // r128 has no usable screen-space transmission in this world. Deliver real
  // two-sided transparent glazing so cabin visibility is deterministic.
  if(material.getName()==='Smoked Smart Glass'||/^glass/.test(material.getName())){
   material.setExtension('KHR_materials_transmission',null).setAlphaMode('BLEND').setDoubleSided(true)
    .setBaseColorFactor([.16,.23,.28,.20]).setMetallicFactor(.05).setRoughnessFactor(.13);
  }
  if(material.getName()==='Carbon Fiber — Directional Weave')material.setBaseColorFactor([.025,.03,.035,1]).setMetallicFactor(.15).setRoughnessFactor(.6);
 }
 const colorTextures=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
 for(const texture of root.listTextures()){
  const edge=colorTextures.has(texture)?512:256;
  texture.setImage(await sharp(texture.getImage()).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png().toBuffer()).setMimeType('image/png');
 }
 const tireBounds=new Map();
 const quadrant=node=>{const b=getBounds(node),x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2;return `${z>0?'front':'rear'}-${x>0?'right':'left'}`;};
 for(const node of nodes)if(recipe.tire.test(node.getName())){
  const key=quadrant(node);if(tireBounds.has(key))throw Error('Ambiguous tire '+key);tireBounds.set(key,getBounds(node));
 }
 if(tireBounds.size!==4)throw Error('Four source tires required.');
 const wheelLayout=[];
 for(const [id,b] of tireBounds){
  const position=b.min.map((v,i)=>(v+b.max[i])/2),radius=(b.max[1]-b.min[1])/2;
  const steering=doc.createNode(id+'-steer').setTranslation(position).setExtras({transportPart:'wheel-steering',front:id.startsWith('front')});
  const spin=doc.createNode(id+'-spin').setExtras({transportPart:'wheel-spin',radiusMeters:radius});steering.addChild(spin);scene.addChild(steering);
  for(const node of nodes){
   const moving=recipe.wheel.test(node.getName()),caliper=recipe.caliper.test(node.getName());
   if((!moving&&!caliper)||quadrant(node)!==id)continue;
   transformMesh(node.getMesh(),new Matrix4().makeTranslation(...position.map(v=>-v)).toArray());
   (caliper?steering:spin).addChild(node);
  }
  wheelLayout.push({id,position,radius});
 }
 const sourceTriangles=triangles(doc);
 if(recipe.motorsport)addMotorsportEquipment(doc,scene,recipe.motorsport);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.47,error:.001,lockBorder:false}));
 if(!root.listTextures().length)for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
  const index=primitive.getIndices(),position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
  if(!index||!normal||index.getCount()<360)continue;
  const [selected]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(index.getArray()),new Float32Array(position.getArray()),3,
   new Float32Array(normal.getArray()),3,[.25,.25,.25],null,Math.floor(index.getCount()*.62/3)*3,.005,['Permissive']);
  primitive.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(index.getBuffer()).setArray(selected));compactPrimitive(primitive);
 }
 await doc.transform(dedup(),join(),prune());
 const final=getBounds(scene),dimensionsMeters=Object.fromEntries(['width','height','length'].map((k,i)=>[k,final.max[i]-final.min[i]]));
 const bytes=await io.writeBinary(doc),count=triangles(doc);
 if(bytes.length>7_000_000||count>110_000||dimensionsMeters.width>2.35)throw Error('Racing fleet budget exceeded: '+JSON.stringify({bytes:bytes.length,count,dimensionsMeters}));
 if(wheelLayout.some(w=>w.radius<.18||w.radius>.55||Math.abs(w.position[0])<.5||Math.abs(w.position[2])<1))throw Error('Invalid wheel envelope.');
 await writeFile(path.join(outputDir,recipe.id+'.glb'),bytes);
 const license=`${recipe.label}\nOriginal model by ${recipe.author}\nSource: ${recipe.sourceUrl}\nCC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/\nDerivative: World Explorer axis/base normalization, uniform metre scale, static closed rest pose, bounded simplification and texture sizes, wheel pivots and compatible glazing. No source gameplay code included. No endorsement implied.\n`;
 await writeFile(path.join(outputDir,recipe.id+'-LICENSE.txt'),license);
 const record={schemaVersion:1,id:recipe.id,label:recipe.label,url:`/app/assets/models/vehicles/racing-fleet/${recipe.id}.glb`,
  roles:['road-vehicle-presentation'],vehicleVariantIds:[recipe.variantId],license:'CC0-1.0',sourceUrl:recipe.sourceUrl,
  attribution:`${recipe.label}: original model by ${recipe.author}, CC0; World Explorer derivative.`,sourceCredit:recipe.author,
  dimensionsMeters,paintMaterialNames:recipe.paint,wheelLayout,
  driverEyeGroundMeters:recipe.eye,sourceUpAxis:'y',rigPolicy:'preserve-parts',collisionPolicy:'existing-road-vehicle-envelope',
  instancePolicy:{geometry:'shared',materials:'clone'},loadPolicy:{bounded:true,timeoutMs:20000},
  budgets:{bytes:bytes.length,triangles:count,textureEdgePixels:512,maxInstances:4}};
 records.push({...record,sourceSha256:recipe.sourceSha256,sha256:hash(bytes),sourceTriangles,materials:root.listMaterials().length,
  drawPrimitives:root.listMeshes().flatMap(m=>m.listPrimitives()).length});
 console.log(JSON.stringify({id:recipe.id,bytes:bytes.length,triangles:count,dimensionsMeters,wheels:wheelLayout.length,primitives:records.at(-1).drawPrimitives}));
}
await writeFile(path.join(outputDir,'asset-manifest.json'),JSON.stringify({schemaVersion:1,assets:records},null,2)+'\n');
await writeFile(path.join(outputDir,'racing-fleet-assets.js'),`// Generated by scripts/prepare-racing-fleet-assets.mjs. Rights and hashes: racing-fleet/asset-manifest.json.\nexport const RACING_FLEET_ASSETS=Object.freeze(${JSON.stringify(records.map(({sourceSha256,sha256,sourceTriangles,materials,drawPrimitives,...r})=>r),null,2)}.map(record=>Object.freeze(record)));\n`);
