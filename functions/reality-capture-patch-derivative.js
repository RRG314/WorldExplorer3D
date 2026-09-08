'use strict';
const sharp=require('sharp');
const {createHash}=require('node:crypto');

async function rectify(bytes,quad,aspect){
  const {photoHomography,projectPhoto}=await import('./capture-projectivity.mjs');
  const {data,info}=await sharp(bytes,{limitInputPixels:20_000_000,failOn:'warning'}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const width=Math.max(32,Math.round(1024*Math.min(1,aspect))),height=Math.max(32,Math.round(1024*Math.min(1,1/aspect))),pixels=Buffer.alloc(width*height*3),h=photoHomography(quad);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const [u,v]=projectPhoto(h,(x+.5)/width,(y+.5)/height),sx=Math.max(0,Math.min(info.width-1,u*(info.width-1))),sy=Math.max(0,Math.min(info.height-1,v*(info.height-1))),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    for(let c=0;c<3;c++){const at=(xx,yy)=>data[(Math.min(yy,info.height-1)*info.width+Math.min(xx,info.width-1))*info.channels+c];pixels[(y*width+x)*3+c]=Math.round((at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy);}
  }
  // Encoding strips original metadata. Only the selected crop is embedded.
  // Photographic textures need photographic compression, not lossless PNG:
  // retain the pixel dimensions without exceeding the per-wall delivery budget.
  return sharp(pixels,{raw:{width,height,channels:3}}).jpeg({quality:88,chromaSubsampling:'4:4:4'}).toBuffer();
}

async function createPatchGlb(capture,preview,loadPhoto){
  const pts=capture.building.spatialContext.footprint;
  const json={asset:{version:'2.0',generator:'World Explorer reviewed planar patches'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}],buffers:[{byteLength:0}],bufferViews:[],accessors:[],extensionsUsed:['KHR_materials_unlit']};
  const buffers=[];let offset=0;
  function view(bytes,target){const padding=(4-offset%4)%4;if(padding){buffers.push(Buffer.alloc(padding));offset+=padding;}const index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.byteLength,...(target?{target}:{})});buffers.push(bytes);offset+=bytes.byteLength;return index;}
  for(const patch of preview.patches){
    const source=capture.inputManifest.find(p=>p.name.endsWith(`/${patch.photoId}.jpg`)||p.name.endsWith(`/${patch.photoId}.webp`));
    if(!source||String(source.generation)!==patch.photoGeneration)throw Error('validated_patch_source_required');
    const bytes=await loadPhoto(source);if(bytes.length!==source.size||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('patch_source_integrity_failed');
    const a=pts[patch.wall],b=pts[(patch.wall+1)%pts.length],[l,bot,r,top]=patch.region;
    const image=await rectify(bytes,patch.quad,Math.hypot(b.x-a.x,b.z-a.z)*(r-l)/(preview.heightMeters*(top-bot)));
    if(image.length>2*1024*1024)throw Error('patch_texture_budget_exceeded');
    const point=(u,v)=>[a.x+(b.x-a.x)*u,preview.heightMeters*v,a.z+(b.z-a.z)*u];
    const positions=new Float32Array([...point(l,bot),...point(r,bot),...point(r,top),...point(l,top)]),uv=new Float32Array([0,1,1,1,1,0,0,0]),indices=new Uint16Array([0,1,2,0,2,3]);
    const index=json.meshes.length,access=json.accessors.length;
    json.accessors.push({bufferView:view(Buffer.from(positions.buffer),34962),componentType:5126,count:4,type:'VEC3',min:[0,1,2].map(c=>Math.min(...[0,1,2,3].map(i=>positions[i*3+c]))),max:[0,1,2].map(c=>Math.max(...[0,1,2,3].map(i=>positions[i*3+c])))},{bufferView:view(Buffer.from(uv.buffer),34962),componentType:5126,count:4,type:'VEC2'},{bufferView:view(Buffer.from(indices.buffer),34963),componentType:5123,count:6,type:'SCALAR'});
    json.images.push({bufferView:view(image),mimeType:'image/jpeg'});json.textures.push({source:index,sampler:0});json.materials.push({doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index},metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}});
    json.meshes.push({primitives:[{attributes:{POSITION:access,TEXCOORD_0:access+1},indices:access+2,material:index}]});json.nodes.push({mesh:index});json.scenes[0].nodes.push(index);
  }
  json.buffers[0].byteLength=offset;let bin=Buffer.concat(buffers);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  let text=Buffer.from(JSON.stringify(json));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+bin.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(bin.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  const result=Buffer.concat([header,text,binaryHeader,bin]);if(result.length>20*1024*1024)throw Error('patch_model_budget_exceeded');return result;
}
module.exports={rectify,createPatchGlb};
