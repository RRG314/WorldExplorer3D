// A personal display belongs to the current interior. It grants no ownership,
// changes no collision, and is never published to the shared building.
export function homeAlbumPlacement(active){
  const pts=active?.usableFootprint,entry=active?.entryPoint;
  if(!active?.ownedHome?.id||!pts?.length||!entry)return null;
  const center=pts.reduce((p,q)=>({x:p.x+q.x/pts.length,z:p.z+q.z/pts.length}),{x:0,z:0});
  const edge=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return {a,b,x:(a.x+b.x)/2,z:(a.z+b.z)/2,length:Math.hypot(b.x-a.x,b.z-a.z)};})
    .filter(e=>e.length>=4&&Math.hypot(e.x-entry.x,e.z-entry.z)>3).sort((a,b)=>b.length-a.length)[0];
  if(!edge)return null;
  let nx=-(edge.b.z-edge.a.z)/edge.length,nz=(edge.b.x-edge.a.x)/edge.length;
  if(nx*(center.x-edge.x)+nz*(center.z-edge.z)<0){nx=-nx;nz=-nz;}
  return {x:edge.x+nx*.19,z:edge.z+nz*.19,y:Number(active.floorBaseY||0)+Number(active.activeLevel||0)*Number(active.floorPlan?.storyHeight||3.4)+1.65,yaw:Math.atan2(nx,nz)};
}

export function disposeThreeViewsHome(active){
  const display=active?.threeViewsDisplay;if(!display)return;
  active.threeViewsDisplay=null;display.disposed=true;
  display.root?.removeFromParent();
  display.resources?.forEach(resource=>resource.dispose());
}

export async function attachThreeViewsHome(active,job,album){
  disposeThreeViewsHome(active);
  if(job?.phase!=='complete'||job.mediaDeleted||job.displayHomeId!==active?.ownedHome?.id||!active?.group?.parent)return false;
  const placement=homeAlbumPlacement(active);if(!placement)return false;
  const T=globalThis.THREE,host=active.group,display={disposed:false,resources:[],root:null};active.threeViewsDisplay=display;
  const root=new T.Group();root.name='Personal Three Views album';display.root=root;
  root.position.set(placement.x,placement.y,placement.z);root.rotation.y=placement.yaw;
  try{
    const photos=job.mode==='photo'?album.photos:[];
    const count=photos.length||1;
    for(let i=0;i<count;i++){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;const c=canvas.getContext('2d');
      c.fillStyle='#eee8db';c.fillRect(0,0,512,384);
      if(photos[i]){
        const image=new Image();image.src=photos[i].dataUrl;await image.decode();
        if(display.disposed||active.group!==host||!host.parent)return false;
        const scale=Math.min(480/image.width,306/image.height),w=image.width*scale,h=image.height*scale;
        c.drawImage(image,(512-w)/2,16+(306-h)/2,w,h);image.src='';
      }else{
        c.fillStyle='#172b3a';c.font='bold 30px sans-serif';c.fillText('THREE OBSERVATIONS',20,80,472);c.font='22px sans-serif';
        ['Street context','Facade detail','District setting'].forEach((line,n)=>c.fillText(line,20,155+n*42));
      }
      c.fillStyle='#223745';c.font='19px sans-serif';c.fillText(`${photos[i]?.kind||'Field record'} · ${job.subject.name}`,16,351,480);
      const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;texture.generateMipmaps=true;
      const material=new T.MeshBasicMaterial({map:texture,toneMapped:false}),geometry=new T.PlaneGeometry(count===1?1.45:1.05,count===1?1.0875:.7875);
      display.resources.push(texture,material,geometry);
      const picture=new T.Mesh(geometry,material);picture.position.x=(i-(count-1)/2)*1.14;root.add(picture);
    }
    if(display.disposed||active.group!==host||!host.parent)return false;
    host.add(root);return true;
  }catch{if(active.threeViewsDisplay===display)disposeThreeViewsHome(active);return false;}
  finally{if((active.group!==host||!host.parent)&&active.threeViewsDisplay===display)disposeThreeViewsHome(active);}
}
