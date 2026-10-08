// The resident pavement and its temporary mapped-path representation use the
// same concrete, world scale and lighting. Ownership still changes atomically
// when detailed geometry arrives; the fallback must not look like white paint.
export function createConcretePavementTexture(THREE) {
  const pixels=new Uint8ClampedArray(256*256*4);
  let seed=7231;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const edge=Math.min(x,y,255-x,255-y),grain=(seed%17)-8;
    const bevel=edge<2?-34:edge<5?8:0;
    const mottling=4*Math.sin(x*.043)*Math.sin(y*.051);
    const v=184+grain+bevel+mottling,i=(y*256+x)*4;
    pixels.set([v+4,v+2,v-2,255],i);
  }
  const texture=new THREE.DataTexture(new Uint8Array(pixels.buffer),256,256);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.encoding=THREE.sRGBEncoding;texture.anisotropy=4;
  texture.flipY=true;texture.generateMipmaps=true;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.needsUpdate=true;
  return texture;
}
