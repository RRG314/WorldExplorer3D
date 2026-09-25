// Convert NASA VTAD's mesh UV atlas to a cylindrical map using its actual UVs.
// The input model is never treated as an equirectangular photograph.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const url='https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/s/Saturn_1_120536.glb';
const response=await fetch(url);if(!response.ok)throw Error(response.status);
const b=Buffer.from(await response.arrayBuffer()),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n)),bin=28+n;
function read(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],k={SCALAR:1,VEC2:2,VEC3:3}[a.type],bytes=a.componentType===5126?4:2,arr=[];for(let j=0;j<a.count;j++)for(let c=0;c<k;c++){const p=bin+(v.byteOffset||0)+(a.byteOffset||0)+j*(v.byteStride||bytes*k)+c*bytes;arr.push(bytes===4?b.readFloatLE(p):b.readUInt16LE(p));}return arr;}
const p=g.meshes[0].primitives[0],pos=read(p.attributes.POSITION),uv=read(p.attributes.TEXCOORD_0),idx=read(p.indices);
async function source(material){const t=g.materials[material].pbrMetallicRoughness.baseColorTexture.index,im=g.images[g.textures[t].source],v=g.bufferViews[im.bufferView];return b.subarray(bin+(v.byteOffset||0),bin+(v.byteOffset||0)+v.byteLength);}
const {data,info}=await sharp(await source(0)).removeAlpha().raw().toBuffer({resolveWithObject:true});
const w=2048,h=1024,out=Buffer.alloc(w*h*3),coverage=new Uint8Array(w*h);
for(let i=0;i<idx.length;i+=3){
 const ids=idx.slice(i,i+3),v=ids.map(j=>{const x=pos[j*3],y=pos[j*3+1],z=pos[j*3+2];return [((Math.atan2(z,-x)/(Math.PI*2)+1)%1)*w,Math.acos(Math.max(-1,Math.min(1,y/Math.hypot(x,y,z))))/Math.PI*h];});
 if(Math.max(...v.map(a=>a[0]))-Math.min(...v.map(a=>a[0]))>w/2)for(const a of v)if(a[0]<w/2)a[0]+=w;
 const [a,c,d]=v,den=(c[1]-d[1])*(a[0]-d[0])+(d[0]-c[0])*(a[1]-d[1]);if(Math.abs(den)<1e-10)continue;
 for(let y=Math.max(0,Math.floor(Math.min(...v.map(a=>a[1]))));y<Math.min(h,Math.ceil(Math.max(...v.map(a=>a[1]))));y++)for(let x=Math.floor(Math.min(...v.map(a=>a[0])));x<Math.ceil(Math.max(...v.map(a=>a[0])));x++){
 const wa=((c[1]-d[1])*(x+.5-d[0])+(d[0]-c[0])*(y+.5-d[1]))/den,wb=((d[1]-a[1])*(x+.5-d[0])+(a[0]-d[0])*(y+.5-d[1]))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)<-1e-5)continue;
 const u=wa*uv[ids[0]*2]+wb*uv[ids[1]*2]+wc*uv[ids[2]*2],t=wa*uv[ids[0]*2+1]+wb*uv[ids[1]*2+1]+wc*uv[ids[2]*2+1];
 const sx=Math.max(0,Math.min(info.width-1,Math.round(u*(info.width-1)))),sy=Math.max(0,Math.min(info.height-1,Math.round(t*(info.height-1)))),pixel=y*w+((x%w+w)%w);for(let k=0;k<3;k++)out[pixel*3+k]=data[(sy*info.width+sx)*3+k];coverage[pixel]=1;
 }
}
// Polar triangles converge to a point. Fill only rasterization gaps from the
// closest covered pixel on that latitude (not invented geographic detail).
let gaps=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!coverage[y*w+x]){gaps++;let found=false;for(let r=1;r<w&&!found;r++)for(const xx of [(x+r)%w,(x-r+w)%w])if(coverage[y*w+xx]){for(let k=0;k<3;k++)out[(y*w+x)*3+k]=out[(y*w+xx)*3+k];found=true;break;}}
await sharp(out,{raw:{width:w,height:h,channels:3}}).jpeg({quality:92}).toFile('app/assets/textures/saturn-nasa-vtad-map.jpg');
await sharp(await source(1)).resize({width:2048,withoutEnlargement:true}).png().toFile('app/assets/textures/saturn-nasa-vtad-rings.png');
console.log({width:w,height:h,polarRasterizationGaps:gaps,source:url});
