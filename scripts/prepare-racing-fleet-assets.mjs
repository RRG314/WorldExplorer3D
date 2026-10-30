// Reproducible, offline derivatives. Download the credited glTF archives through
// Sketchfab, extract each into SOURCE/<key>, and pass an EMPTY output directory.
// The pinned Blender M3 derivative is prepared first with
// prepare-bmw-m3-race-blend.py into SOURCE/prepared-bmw-race-v4.
// Originals, credentials and marketplace archives never enter the web bundle.
// After installing reviewed records/GLBs, run update-model-asset-revisions.mjs
// so the shared bounded loader receives the exact bundled content identity.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {compactPrimitive, dedup, flatten, getBounds, join, prune, simplify, transformMesh, weld} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4} from 'three';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const recipes = [
 {key:'porsche_carrera_4s',inputDirectory:'prepared-porsche-carrera-v3',prepared:true,id:'road-porsche-911-carrera-4s',variantId:'porsche_carrera_4s',license:'CC-BY-SA-4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attribution:'Porsche 911 Carrera 4S by Karol Miklas',sourceCredit:'Karol Miklas (https://sketchfab.com/karolmiklas)',
  sourceFiles:{'scene.glb':'c0a6aea94ced833708aaa3987fd1e9be977102fbcd367f9da14e54d60e06d511','license.txt':'807197ef352fd72292e5a0f30b7edadc93d5c916a747f902ec87795ae8201d1a','intake.json':'c74dfc44e7a8854fda8cbf4e071da4bb1d6ab02f38398d09a6892b4ae43af84e'},
  archiveSha256:'57731111fbb0d6958df64454e9ba51939fefd39ab48e55f423a0bb2d76918454'},
 {key:'bmw_m3_e92_race',inputDirectory:'prepared-bmw-race-v4',prepared:true,id:'road-bmw-m3-e92-race',variantId:'bmw_m3_e92_race',
  sourceFiles:{'scene.glb':'5677903fb698ed189c4df3f312f2abfc758eb20df1745240dd4756dc753b2de8','license.txt':'cbe923e24e81ab0e0b782f185e910bd4f027ebb9ab3272a9ca02c92e32e328ea','intake.json':'b9f7cb58f26c0f9c864584d9addb167705a49bf1e751fc7b7406ee2e26de078e'},
  archiveSha256:'e2193befa1da6a7394b3eadee3704727290a1c2520108fe909827c6052e0417f'},
 {key:'bmw_m3_e46',variantId:'bmw_m3_e46',id:'road-bmw-m3-e46',label:'BMW M3 E46',uid:'f1b00ff37d504629b10031da32bc7497',author:'MMC Works',
  sourceFiles:{"scene.gltf":"6cd48944f7eb61aa439381eb38c2c8ac8229cff838e10d704e7704dac94b0106","license.txt":"236e6653004f033efca5a17d0603bfdaa731d9ff7a4d492bd6136d52e80a644e","scene.bin":"841850ea9c9be48ef2a7e830911ae33241761ec91bad5048ac63cf7348c211e4","textures/Car_Paint_-_All_Colors_metallicRoughness.png":"a6f2970c6b6ae7cd640768a9157ebbab4a892db2de7a9cddbcce12b2cede5439","textures/Alu_ext_metallicRoughness.png":"2aae3903aee43fd900d3c9eb70b6b5ae56ec5d1ddb28aced5bb91842dd0a44c1","textures/MetalStainlessSteelBrushedElongated005_2K.003_baseColor.jpeg":"ad91ea288f3df444b42a22eb8088083b461539ce62b8b1abe465e8c157cc133d","textures/MetalStainlessSteelBrushedElongated005_2K.003_metallicRoughness.png":"30ca3583f4b148b819f2782038208e76e63883b98642ca9e29db92b3a91ad7fb","textures/MetalStainlessSteelBrushedElongated005_2K.003_normal.png":"a4a00f76926ca9887481718e672c400d310c7f11e95f3f363f45175a3379f5ee","textures/MetalStainlessSteelBrushedElongated005_2K.001_normal.png":"a4a00f76926ca9887481718e672c400d310c7f11e95f3f363f45175a3379f5ee","textures/MetalStainlessSteelBrushedElongated005_2K_metallicRoughness.png":"30ca3583f4b148b819f2782038208e76e63883b98642ca9e29db92b3a91ad7fb"},
  archiveSha256:'646b76b04853df219522d73162bb3108e5d85f00729fd460ce05120ed1c9d054',length:4.493,yaw:0,ratio:.12,
  paint:['Car_Paint_-_All_Colors'],wheels:/(?:^|\/)(?:tire-(?:front|rear)|wheels-bbs|Brake Disc|Brake Hub)/,
  calipers:/(?:^|\/)Brake Caliper/,eye:[.345,1.075,.015]}
];
const [sourceDir, outputDir, ...selectedKeys] = process.argv.slice(2);
if (!sourceDir || !outputDir) throw Error('Usage: node scripts/prepare-racing-fleet-assets.mjs SOURCE EMPTY_OUTPUT');
await mkdir(outputDir,{recursive:true});
if ((await readdir(outputDir)).length) throw Error('Output must be empty; never overwrite originals or a reviewed derivative.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS), records=[];
await MeshoptSimplifier.ready;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function ancestorName(node) {
  const names=[];for(let p=node;p;p=p.getParentNode())names.push(p.getName());return names.join('/');
}
function triangleCount(doc) {
  return doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
}
function simplifySolidModifierSeams(doc) {
  // Solid material parts have no texture/vertex-color streams. Normal-aware permissive
  // simplification can cross modifier-generated duplicate seams while retaining
  // material boundaries and silhouette error, rather than dropping its interior.
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
    const material=primitive.getMaterial();
    if(primitive.getAttribute('COLOR_0')||material&&[material.getBaseColorTexture(),material.getNormalTexture(),material.getMetallicRoughnessTexture(),material.getOcclusionTexture(),material.getEmissiveTexture()].some(Boolean))continue;
    const index=primitive.getIndices(),position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
    if(!index||!normal||index.getCount()<360)continue;
    const indices=new Uint32Array(index.getArray());
    const [simplified]=MeshoptSimplifier.simplifyWithAttributes(indices,new Float32Array(position.getArray()),3,new Float32Array(normal.getArray()),3,[.25,.25,.25],null,Math.floor(indices.length*.3/3)*3,.003,['Permissive']);
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(index.getBuffer()).setArray(simplified));compactPrimitive(primitive);
  }
}
for (const recipe of recipes.filter(r=>!selectedKeys.length||selectedKeys.includes(r.key))) {
  const directory=path.join(sourceDir,recipe.inputDirectory||recipe.key);
  for(const [file,expected]of Object.entries(recipe.sourceFiles))if(hash(await readFile(path.join(directory,file)))!==expected)throw Error('Unreviewed source file: '+file);
  if(recipe.prepared){
    const intake=JSON.parse(await readFile(path.join(directory,'intake.json'),'utf8'));
    if(intake.archiveSha256!==recipe.archiveSha256||intake.license!==(recipe.license||'CC0-1.0'))throw Error('Unreviewed prepared racing source');
    const doc=await io.read(path.join(directory,'scene.glb')),root=doc.getRoot();
    if(root.listAnimations().length||root.listSkins().length)throw Error('Prepared racing source must remain rigid');
    const sourceTriangles=triangleCount(doc),bounds=getBounds(root.listScenes()[0]);
    const preserved=node=>{for(let p=node;p;p=p.getParentNode())if(p.getExtras().transportPart||p.getExtras().vehicleInstrumentDisplay)return true;return false;};
    await doc.transform(dedup(),join({filter:node=>!preserved(node)}),prune());
    const bytes=await io.writeBinary(doc),triangles=triangleCount(doc),filename=recipe.id+'.glb';
    if(bytes.length>7_000_000||triangles>110_000||Math.abs(bounds.min[1])>.00001||Math.abs(bounds.max[2]-bounds.min[2]-intake.lengthMeters)>.00001)throw Error('Prepared racing model exceeds envelope/budget');
    if(root.listNodes().filter(n=>n.getExtras().transportPart==='wheel-spin').length!==4||root.listNodes().filter(n=>n.getExtras().vehicleInstrumentDisplay).length!==1)throw Error('Prepared wheel/cockpit rig changed');
    if(root.listNodes().filter(n=>n.getExtras().vehicleInstrumentDisplay).some(n=>n.getMesh().listPrimitives().some(p=>!p.getAttribute('TEXCOORD_0'))))throw Error('Prepared cockpit display requires retained glTF texture coordinates');
    const sourceLicense=await readFile(path.join(directory,'license.txt'));
    await writeFile(path.join(outputDir,filename),bytes);await writeFile(path.join(outputDir,recipe.id+'-LICENSE.txt'),sourceLicense);
    const record={id:recipe.id,label:intake.label,variantId:recipe.variantId,sourceUrl:intake.sourceUrl,attribution:recipe.attribution||'BMW M3 racing exterior by Neubi',sourceCredit:recipe.sourceCredit||'Neubi (https://blendswap.com/profile/1050)',license:intake.license,licenseUrl:recipe.licenseUrl||'https://creativecommons.org/publicdomain/zero/1.0/',filename,sourceArchiveSha256:intake.archiveSha256,sourceBlendSha256:intake.blendSha256,sha256:hash(bytes),bytes:bytes.length,sourceTriangles,triangles,materials:root.listMaterials().length,textureEdgePixels:512,dimensionsMeters:{width:bounds.max[0]-bounds.min[0],height:bounds.max[1]-bounds.min[1],length:intake.lengthMeters},driverEyeGroundMeters:intake.driverEyeGroundMeters,paintMaterialNames:intake.paintMaterialNames||['Race_Paint'],wheelLayout:intake.wheelLayout,modifications:intake.modifications};
    records.push(record);console.log(JSON.stringify({id:record.id,bytes:record.bytes,triangles,materials:record.materials,wheels:record.wheelLayout.length}));continue;
  }
  const input=path.join(directory,'scene.gltf');
  const doc=await io.read(input), root=doc.getRoot(), scene=root.listScenes()[0];
  if(root.listSkins().length||root.listAnimations().length)throw Error(`${recipe.key}: animated source needs a separate reviewed recipe.`);
  const intake=JSON.parse(await readFile(path.join(sourceDir,recipe.key,'intake.json'),'utf8'));
  if(intake.archiveSha256!==recipe.archiveSha256)throw Error('Unreviewed source archive');
  const sourceLicense=await readFile(path.join(sourceDir,recipe.key,'license.txt'),'utf8');
  if(!sourceLicense.includes('CC-BY-4.0')||!sourceLicense.includes(recipe.uid))throw Error('Source licence mismatch');
  const meshes=root.listNodes().filter(n=>n.getMesh());
  for(const node of meshes)node.setExtras({...node.getExtras(),sourcePart:ancestorName(node)});
  await doc.transform(flatten());
  const rotation=new Matrix4().makeRotationY(recipe.yaw);
  for(const node of meshes) {
    const mesh=node.getMesh().clone();node.setMesh(mesh);
    transformMesh(mesh,rotation.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix())).toArray());
    scene.addChild(node);node.setMatrix(new Matrix4().toArray());
  }
  for(const child of [...scene.listChildren()])if(!meshes.includes(child))scene.removeChild(child);
  await doc.transform(prune());
  // This source's front wheel assemblies are posed at 20 degrees in the
  // showcase. Straighten their original meshes before adding runtime pivots;
  // the transport owner alone applies steering during play.
  const frontCenters=new Map();
  for(const node of meshes)if(/(?:^|\/)tire-front/.test(node.getExtras().sourcePart||'')){const b=getBounds(node),c=b.min.map((v,i)=>(v+b.max[i])/2);frontCenters.set(c[0]>0?'right':'left',c);}
  if(frontCenters.size!==2)throw Error('Source front tire assemblies changed');
  for(const node of meshes)if(recipe.wheels.test(node.getExtras().sourcePart||'')||recipe.calipers.test(node.getExtras().sourcePart||'')){
    const b=getBounds(node),middle=b.min.map((v,i)=>(v+b.max[i])/2),c=frontCenters.get(middle[0]>0?'right':'left');
    if(middle[2]>0){const m=new Matrix4().makeTranslation(...c).multiply(new Matrix4().makeRotationY(20*Math.PI/180)).multiply(new Matrix4().makeTranslation(...c.map(v=>-v)));transformMesh(node.getMesh(),m.toArray());}
  }
  const bounds=getBounds(scene),size=bounds.max.map((v,i)=>v-bounds.min[i]),factor=recipe.length/size[2],scale=[factor,factor,factor];
  recipe.dimensions=size.map(v=>v*factor);
  const center=[(bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2];
  const normalize=new Matrix4().makeScale(...scale).multiply(new Matrix4().makeTranslation(...center.map(v=>-v)));
  for(const node of meshes)transformMesh(node.getMesh(),normalize.toArray());
  // Correct mirror-like painted bodywork for the game's outdoor lighting.
  // Keep stainless steel, glass, upholstery and authored texture maps separate.
  for(const mat of root.listMaterials())if(recipe.paint?.includes(mat.getName())){
    mat.setMetallicFactor(.35).setRoughnessFactor(.32);
    mat.setBaseColorFactor([.08,.18,.34,1]);
  }
  for(const mat of root.listMaterials())if(mat.getName()==='Glass_ext'||mat.getName()==='Glass_ext-tinted')mat.setAlphaMode('BLEND').setDoubleSided(true).setMetallicFactor(.04).setRoughnessFactor(.13).setBaseColorFactor([.15,.21,.25,.18]);
  const colorMaps=new Set(root.listMaterials().map(m=>m.getBaseColorTexture()));
  for(const texture of root.listTextures()){
    const edge=colorMaps.has(texture)?512:256;
    texture.setImage(await sharp(texture.getImage()).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).png().toBuffer()).setMimeType('image/png');
  }
  const sourceTriangles=triangleCount(doc);
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:recipe.ratio,error:.001,lockBorder:false}));
  simplifySolidModifierSeams(doc);
  // Wheel groups retain artist geometry/materials. Split combined left/right
  // wheel primitives by axle quadrant, never by cutting arbitrary body panels.
  const wheelMeshes=new Map();
  if(!recipe.aircraft)for(const node of meshes){
    const mesh=node.getMesh();
    if(!mesh)continue; // Pruning can remove empty modifier-generated parts.
    for(const primitive of [...mesh.listPrimitives()]){
      if(!recipe.wheels.test(node.getExtras().sourcePart||'')&&!recipe.wheels.test(primitive.getMaterial()?.getName()||''))continue;
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),groups=new Map();
      for(let i=0;i<(indices?.getCount()||positions.getCount());i+=3){
        const tri=[0,1,2].map(j=>indices?indices.getScalar(i+j):i+j);
        const c=tri.reduce((sum,j)=>{const v=positions.getElement(j,[]);return sum.map((n,k)=>n+v[k]/3);},[0,0,0]);
        const key=`${c[2]>0?'front':'rear'}-${c[0]>0?'right':'left'}`;
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...tri);
      }
      for(const [key,selected] of groups){
        const part=primitive.clone().setIndices(doc.createAccessor().setType('SCALAR').setBuffer(root.listBuffers()[0]).setArray(new Uint32Array(selected)));
        compactPrimitive(part);
        if(!wheelMeshes.has(key))wheelMeshes.set(key,doc.createMesh(key));wheelMeshes.get(key).addPrimitive(part);
      }
      mesh.removePrimitive(primitive);
    }
  }
  const wheelLayout=[];
  for(const [key,mesh] of wheelMeshes){
    const spin=doc.createNode(`${key}-spin`).setMesh(mesh);
    const steering=doc.createNode(`${key}-steer`).addChild(spin);scene.addChild(steering);
    const b=getBounds(steering), c=b.min.map((v,i)=>(v+b.max[i])/2), radius=(b.max[1]-b.min[1])/2;
    transformMesh(mesh,new Matrix4().makeTranslation(...c.map(v=>-v)).toArray());steering.setTranslation(c);
    for(const node of meshes)if(node.getMesh()&&recipe.calipers.test(node.getExtras().sourcePart||'')){const b=getBounds(node),id=`${(b.min[2]+b.max[2])/2>0?'front':'rear'}-${(b.min[0]+b.max[0])/2>0?'right':'left'}`;if(id===key){transformMesh(node.getMesh(),new Matrix4().makeTranslation(...c.map(v=>-v)).toArray());node.setExtras({...node.getExtras(),transportPart:'wheel-caliper'});steering.addChild(node);}}
    steering.setExtras({transportPart:'wheel-steering',front:key.startsWith('front')});
    spin.setExtras({transportPart:'wheel-spin',radiusMeters:radius});wheelLayout.push({id:key,position:c,radius});
  }
  await doc.transform(prune(),dedup(),join({filter:node=>!node.getExtras().transportPart&&!node.getExtras().aircraftRotor}),prune());
  const bytes=await io.writeBinary(doc), filename=recipe.id+'.glb';
  if(bytes.length>7_000_000||triangleCount(doc)>110_000)throw Error(`${recipe.key}: derived model exceeds intake budget (${bytes.length} bytes, ${triangleCount(doc)} triangles).`);
  if(!recipe.aircraft&&wheelLayout.length!==4)throw Error(`${recipe.key}: expected four wheel pivots, found ${wheelLayout.length}.`);
  for(const wheel of wheelLayout)if(Math.abs(wheel.position[0])<recipe.dimensions[0]*.25||Math.abs(wheel.position[2])<recipe.dimensions[2]*.2||!(wheel.radius>.18&&wheel.radius<.55))throw Error(`${recipe.key}: implausible wheel pivot ${wheel.id}.`);
  await writeFile(path.join(outputDir,filename),bytes);
  await writeFile(path.join(outputDir,recipe.id+'-LICENSE.txt'),sourceLicense);
  const record={id:recipe.id,label:recipe.label,variantId:recipe.variantId||null,sourceUrl:sourceLicense.match(/\* source:\s*(https:\/\/\S+)/)?.[1],attribution:`${recipe.label} by ${recipe.author}`,sourceCredit:sourceLicense.match(/\* author:\s*([^\n]+)/)?.[1],license:'CC-BY-4.0',filename,sourceArchiveSha256:intake.archiveSha256,sha256:hash(bytes),bytes:bytes.length,sourceTriangles,triangles:triangleCount(doc),materials:root.listMaterials().length,textureEdgePixels:512,dimensionsMeters:{width:recipe.dimensions[0],height:recipe.dimensions[1],length:recipe.dimensions[2]},driverEyeGroundMeters:recipe.eye,paintMaterialNames:recipe.paint||[],wheelLayout,aircraft:recipe.aircraft===true,modifications:'Offline axis/scale/base normalization; 512px color / 256px data maps; bounded mesh simplification; rigid wheel pivots. Adjusted paint/trim roughness and selected body colors. Front wheel assemblies straightened from the original 20 degree showcase pose; four runtime wheel pivots. No gameplay simulation imported.'};
  records.push(record);console.log(JSON.stringify({id:record.id,bytes:record.bytes,triangles:record.triangles,materials:record.materials,wheels:wheelLayout.length}));
}
await writeFile(path.join(outputDir,'asset-manifest.json'),JSON.stringify({schemaVersion:1,licenseUrls:[...new Set(records.map(r=>r.licenseUrl||'https://creativecommons.org/licenses/by/4.0/'))],assets:records},null,2)+'\n');
const catalog=records.map(r=>({schemaVersion:1,id:r.id,label:r.label,url:`/app/assets/models/vehicles/racing-fleet/${r.filename}`,roles:['road-vehicle-presentation'],vehicleVariantIds:r.variantId?[r.variantId]:[],license:r.license,sourceUrl:r.sourceUrl,attribution:r.attribution,sourceCredit:r.sourceCredit,dimensionsMeters:r.dimensionsMeters,paintMaterialNames:r.paintMaterialNames,wheelLayout:r.wheelLayout,driverEyeGroundMeters:r.driverEyeGroundMeters,sourceUpAxis:'y',rigPolicy:'preserve-parts',collisionPolicy:'existing-road-vehicle-envelope',instancePolicy:{geometry:'shared',materials:'clone'},loadPolicy:{bounded:true,timeoutMs:20000},budgets:{bytes:r.bytes,triangles:r.triangles,textureEdgePixels:r.textureEdgePixels,maxInstances:4}}));
await writeFile(path.join(outputDir,'racing-fleet-assets.js'),'// Generated by scripts/prepare-racing-fleet-assets.mjs. Source rights and hashes: bundled asset-manifest.json.\nexport const RACING_FLEET_ASSETS = Object.freeze('+JSON.stringify(catalog,null,2)+'.map(record => Object.freeze(record)));\n');
