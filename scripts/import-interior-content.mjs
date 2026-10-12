// Offline tooling only. Downloaded content is data, never executable code.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {KHRMaterialsUnlit} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hosts = new Set(['3d-api.si.edu','images.metmuseum.org']);
export function validateImportSource(source) {
  const url = new URL(source.url);
  if(url.protocol!=='https:'||!hosts.has(url.hostname)||url.port||url.username||url.password)throw Error('Source host is not approved.');
  if(!/^[a-z0-9-]{1,64}$/.test(source.id)||!/^museum-[a-z0-9-]{1,64}$/.test(source.assetId))throw Error('Invalid import identity.');
  if(source.review?.status!=='approved'||!source.review.evidence||source.license!=='CC0-1.0'||!/^https:/.test(source.rightsEvidence))throw Error('Missing reviewed rights.');
  if(!/^[a-f0-9]{64}$/.test(source.sha256)||!['glb','image'].includes(source.kind))throw Error('Unpinned or unsupported input.');
  if(!(source.maxSourceBytes>0&&source.maxSourceBytes<=20000000&&source.maxOutputBytes>0&&source.maxOutputBytes<=4500000&&source.triangles>0&&source.triangles<=50000&&source.textureEdgePixels<=1024))throw Error('Invalid import budgets.');
  return source;
}
export function inspectInteriorGlb(bytes) {
  if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header.');
  const jsonLength=bytes.readUInt32LE(12);
  if(jsonLength>2000000||jsonLength%4||20+jsonLength>bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Invalid GLB JSON.');
  const data=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
  if(data.asset?.version!=='2.0'||data.animations?.length||data.skins?.length)throw Error('Only static glTF 2.0 exhibits are admitted.');
  if([...data.buffers||[],...data.images||[]].some(item=>item.uri))throw Error('External or data URI resources are forbidden.');
  if((data.extensionsUsed||[]).some(name=>name!=='KHR_materials_unlit'))throw Error('Unreviewed GLB extension.');
  if((data.meshes||[]).length>64||(data.nodes||[]).length>128||(data.materials||[]).length>16||(data.images||[]).length>16)throw Error('GLB structure exceeds review limits.');
  for(const node of data.nodes||[])for(const key of ['matrix','translation','rotation','scale'])if(node[key]?.some(v=>!Number.isFinite(v)))throw Error('Invalid transform.');
  for(const mesh of data.meshes||[])for(const p of mesh.primitives||[])if(p.mode!==undefined&&p.mode!==4)throw Error('Only triangle meshes are supported.');
  return data;
}
async function acquire(source,directory,download) {
  const path=`${directory}/${source.id}.source`;
  let bytes;try {bytes=await readFile(path);}catch(error){if(error.code!=='ENOENT'||!download)throw error;}
  if(!bytes){
    const response=await fetch(source.url,{signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!response.ok||Number(response.headers.get('content-length'))>source.maxSourceBytes)throw Error(`Source unavailable: ${response.status}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>source.maxSourceBytes)throw Error('Source exceeds byte limit.');chunks.push(chunk);}
    bytes=Buffer.concat(chunks);
  }
  if(bytes.length>source.maxSourceBytes||sha(bytes)!==source.sha256)throw Error(`Source hash/size mismatch: ${source.id}`);
  if(source.kind==='glb')inspectInteriorGlb(bytes);
  await writeFile(path,bytes);return bytes;
}
const triangleCount=doc=>doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
async function resizeTextures(doc,edge){
  for(const texture of doc.getRoot().listTextures()){
    const image=sharp(texture.getImage(),{limitInputPixels:18000000}),metadata=await image.metadata();
    const resized=image.resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true});
    const bytes=await (metadata.hasAlpha?resized.png():resized.jpeg({quality:90,chromaSubsampling:'4:4:4'})).toBuffer();
    texture.setImage(bytes).setMimeType(metadata.hasAlpha?'image/png':'image/jpeg');
  }
}
async function imagePanel(bytes){
  const doc=new Document(),buffer=doc.createBuffer(),image=sharp(bytes,{limitInputPixels:18000000}),metadata=await image.metadata();
  if(!metadata.width||!metadata.height||metadata.pages>1)throw Error('Invalid exhibit image.');
  const width=metadata.width/Math.max(metadata.width,metadata.height),height=metadata.height/Math.max(metadata.width,metadata.height);
  const texture=doc.createTexture().setImage(await image.png().toBuffer()).setMimeType('image/png');
  const material=doc.createMaterial().setBaseColorTexture(texture).setDoubleSided(true).setExtension('KHR_materials_unlit',doc.createExtension(KHRMaterialsUnlit).createUnlit());
  const attribute=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(new Float32Array(array));
  const primitive=doc.createPrimitive().setAttribute('POSITION',attribute('VEC3',[-width/2,0,0,width/2,0,0,width/2,height,0,-width/2,height,0]))
    .setAttribute('NORMAL',attribute('VEC3',[0,0,1,0,0,1,0,0,1,0,0,1]))
    .setAttribute('TEXCOORD_0',attribute('VEC2',[0,1,1,1,1,0,0,0]))
    .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array([0,1,2,0,2,3]))).setMaterial(material);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));return doc;
}
export async function importInteriorSources({manifestPath='config/interior-imports.json',quarantine='output/interior-expansion/quarantine',destination='app/assets/models/interiors/museum',download=false}={}){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.sources)||manifest.sources.length>24)throw Error('Unsupported source manifest.');
  manifest.sources.forEach(validateImportSource);
  if(new Set(manifest.sources.map(s=>s.assetId)).size!==manifest.sources.length)throw Error('Duplicate import identity.');
  await mkdir(quarantine,{recursive:true});await mkdir(destination,{recursive:true});await MeshoptSimplifier.ready;
  const io=new NodeIO().registerExtensions([KHRMaterialsUnlit]),records=[];
  for(const source of manifest.sources){
    const bytes=await acquire(source,quarantine,download),doc=source.kind==='glb'?await io.readBinary(bytes):await imagePanel(bytes);
    if(doc.getRoot().listScenes().length!==1)throw Error('One reviewed scene is required.');
    const scene=doc.getRoot().listScenes()[0],bounds=getBounds(scene),extent=Math.max(...bounds.max.map((v,i)=>v-bounds.min[i]));
    if(!(extent>0&&Number.isFinite(extent)))throw Error('Invalid geometry bounds.');
    // Preserve node hierarchy, materials and scan mounts. No invented tissue,
    // removed supports or scientific scale claim: this is a labelled display.
    const parent=doc.createNode('Normalized exhibit').setScale([1/extent,1/extent,1/extent]).setTranslation([-(bounds.min[0]+bounds.max[0])/2/extent,-bounds.min[1]/extent,-(bounds.min[2]+bounds.max[2])/2/extent]);
    for(const child of [...scene.listChildren()])parent.addChild(child);scene.addChild(parent);
    await resizeTextures(doc,source.textureEdgePixels);
    if(triangleCount(doc)>source.triangles)await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:source.triangles/triangleCount(doc),error:.01,lockBorder:false}));
    await doc.transform(dedup(),prune());
    const near=await io.writeBinary(doc),count=triangleCount(doc);
    if(near.length>source.maxOutputBytes||count>source.triangles+2)throw Error(`Output exceeds approved budget: ${source.id} (${near.length} bytes, ${count} triangles)`);
    inspectInteriorGlb(Buffer.from(near));await writeFile(`${destination}/${source.id}.glb`,near);
    const tiers=[{id:source.assetId,file:`${source.id}.glb`,bytes:near.length,sha256:sha(near),triangles:count,textureEdgePixels:source.textureEdgePixels,bounds:getBounds(scene)}];
    if(source.kind==='glb'){
      await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.2,error:.02,lockBorder:false}),prune());await resizeTextures(doc,512);
      const lod=await io.writeBinary(doc);inspectInteriorGlb(Buffer.from(lod));await writeFile(`${destination}/${source.id}-lod.glb`,lod);
      tiers.push({id:`${source.assetId}-lod`,file:`${source.id}-lod.glb`,bytes:lod.length,sha256:sha(lod),triangles:triangleCount(doc),textureEdgePixels:512,bounds:getBounds(scene)});
    }
    records.push({...source,sourceBytes:bytes.length,normalization:manifest.normalization,modifications:'Uniform display normalization; scan mounts retained; simplified geometry; textures resized (JPEG for opaque images, PNG for alpha). Artwork converted to a textured panel; no reproduction claims about the host museum.',tiers});
  }
  const result={schemaVersion:1,records};await writeFile(`${destination}/asset-manifest.json`,JSON.stringify(result,null,2)+'\n');
  await writeFile(`${destination}/LICENSE.txt`,records.map(r=>`${r.title}\n${r.author}\n${r.license} — https://creativecommons.org/publicdomain/zero/1.0/\nSource: ${r.url}\nRights: ${r.rightsEvidence}\n${r.modifications}\n`).join('\n'));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await importInteriorSources({download:process.argv.includes('--download')});console.log(JSON.stringify(result.records.map(r=>({id:r.id,tiers:r.tiers})),null,2));}
