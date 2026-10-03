// One original atlas per close-detail publication. Labels retain map provenance;
// no generated business names or claims that a labeled building is enterable.
export function mappedFrontageLabel(value) {
 const label=String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return label.length>=3 && !/^(building|retail|commercial|office|yes|unknown)$/i.test(label) ? label.slice(0,64) : '';
}
export function createFrontageSigns(records,{THREE=globalThis.THREE,document=globalThis.document}={}) {
 const selected=records.filter(r=>mappedFrontageLabel(r.name)&&r.length>3.5).slice(0,24);
 if(!selected.length||!document)return null;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const paint=canvas.getContext('2d');if(!paint)return null;
 const positions=[],normals=[],uvs=[],indices=[];
 selected.forEach((r,i)=>{
  const col=i%4,row=Math.floor(i/4),x=col*256,y=row*64,label=mappedFrontageLabel(r.name);
  paint.fillStyle='#152b34';paint.fillRect(x,y,256,64);paint.strokeStyle='#baa887';paint.lineWidth=3;paint.strokeRect(x+8,y+6,240,52);
  let size=28;paint.font=`600 ${size}px sans-serif`;while(paint.measureText(label).width>226 && size>12){size--;paint.font=`600 ${size}px sans-serif`;}
  paint.fillStyle='#f6e9cc';paint.textAlign='center';paint.textBaseline='middle';paint.fillText(label,x+128,y+32,226);
  const width=Math.min(5.2,r.length-.6),height=.72,cx=r.x+r.normalX*.19,cz=r.z+r.normalZ*.19;
  const rightX=r.normalZ,rightZ=-r.normalX,base=positions.length/3;
  for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){positions.push(cx+rightX*sx*width/2,r.y+sy*height/2,cz+rightZ*sx*width/2);normals.push(r.normalX,0,r.normalZ);}
  const u0=(x+1)/1024,u1=(x+255)/1024,v0=1-(y+63)/512,v1=1-(y+1)/512;uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);indices.push(base,base+1,base+2,base,base+2,base+3);
 });
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;texture.generateMipmaps=true;
 const material=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.85,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.16,side:THREE.DoubleSide});material.userData.ownsFrontageAtlas=true;
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Mapped frontage names';mesh.userData={buildingExteriorDetailBatch:true,sourceClaim:'mapped-name-on-original-generated-sign',labels:selected.map(r=>({name:mappedFrontageLabel(r.name),sourceBuildingId:r.sourceBuildingId,x:r.x,y:r.y,z:r.z,normalX:r.normalX,normalZ:r.normalZ}))};return mesh;
}
