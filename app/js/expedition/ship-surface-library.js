// One set of licensed maps per boarding, shared across all decks. Data maps
// stay linear; only the colour maps are decoded from sRGB.
export function createShipSurfaceLibrary(THREE, renderer, fallback) {
  const textures=new Map(),materials=new Map(),pending=[];
  let disposed=false;
  const texture=(id,channel)=>{
    const key=`${id}-${channel}`;
    if(textures.has(key))return textures.get(key);
    let complete;
    pending.push(new Promise(resolve=>{complete=resolve;}));
    const map=new THREE.TextureLoader().load(`/app/assets/textures/ship/${key}.png`,loaded=>{
      if(disposed)loaded.dispose();
      complete(true);
    },undefined,()=>{
      for(const material of materials.values())for(const slot of ['map','normalMap','roughnessMap','metalnessMap']) {
        if(material[slot]===map){material[slot]=null;material.roughness=.8;material.metalness=.05;material.needsUpdate=true;}
      }
      complete(false);
      console.warn(`Ship surface unavailable: ${key}`);
    });
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.encoding=channel==='color'?THREE.sRGBEncoding:THREE.LinearEncoding;
    map.anisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()||1);
    textures.set(key,map);return map;
  };
  function surface(kind,deckId) {
    const key=`${deckId}:${kind}`;
    if(materials.has(key))return materials.get(key);
    if(kind==='floor'&&deckId==='engineering') {
      const result=fallback(kind,deckId);materials.set(key,result);return result;
    }
    const id=kind==='floor'?'carpet':'bulkhead';
    const packed=texture(id,'roughness-metalness');
    const result=new THREE.MeshStandardMaterial({color:0xffffff,map:texture(id,'color'),
      roughness:1,metalness:id==='carpet'?0:1,roughnessMap:packed,metalnessMap:packed,
      normalMap:id==='bulkhead'?texture(id,'normal'):null});
    result.userData.shipTileSize=id==='carpet'?1.5:3.6;
    result.userData.shipSurfaceSource='sketchfab-michael-v-computer-room';
    materials.set(key,result);return result;
  }
  return {surface,ready:()=>Promise.all(pending).then(results=>results.every(Boolean)),dispose(){disposed=true;for(const map of textures.values())map.dispose();textures.clear();}};
}
