// Deterministic appearance for unresolved planets, sampled on a unit sphere.
// 3D noise avoids a longitude seam and stretched brush marks at the poles.
function lattice(x, y, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, z, seed) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const smooth=v=>v*v*(3-2*v),a=smooth(x-ix),b=smooth(y-iy),c=smooth(z-iz);
  const mix=(v,w,t)=>v+(w-v)*t;
  return mix(mix(mix(lattice(ix,iy,iz,seed),lattice(ix+1,iy,iz,seed),a),mix(lattice(ix,iy+1,iz,seed),lattice(ix+1,iy+1,iz,seed),a),b),mix(mix(lattice(ix,iy,iz+1,seed),lattice(ix+1,iy,iz+1,seed),a),mix(lattice(ix,iy+1,iz+1,seed),lattice(ix+1,iy+1,iz+1,seed),a),b),c);
}
export function planetSurfaceValue(profile,x,y,z) {
  let terrain=0,weight=.5333,frequency=3;
  for(let i=0;i<4;i++) {terrain+=weight*noise(x*frequency,y*frequency,z*frequency,profile.seed);weight*=.5;frequency*=2.03;}
  if(['gas-giant','ice-giant','mini-neptune'].includes(profile.kind)) {
    return .5+.35*Math.sin(y*58+(terrain-.5)*12)+.15*(terrain-.5);
  }
  const detail=noise(x*83,y*83,z*83,profile.seed+17);
  return Math.max(0,Math.min(1,(terrain-.25)*1.8+(detail-.5)*.12));
}
export function fillPlanetSurface(profile,width,height,rgba) {
  const palette=profile.palette.map(hex=>[(hex>>>16)&255,(hex>>>8)&255,hex&255]);
  for(let row=0;row<height;row++) {
    const latitude=Math.PI*(row/(height-1)-.5),y=Math.sin(latitude),r=Math.cos(latitude);
    for(let column=0;column<width;column++) {
      const longitude=2*Math.PI*column/(width-1),x=r*Math.cos(longitude),z=r*Math.sin(longitude);
      const value=planetSurfaceValue(profile,x,y,z),band=Math.min(1,Math.floor(value*2)),blend=value*2-band;
      const offset=(row*width+column)*4;
      for(let channel=0;channel<3;channel++) rgba[offset+channel]=Math.round(palette[band][channel]*(1-blend)+palette[band+1][channel]*blend);
      rgba[offset+3]=255;
    }
  }
  return rgba;
}
