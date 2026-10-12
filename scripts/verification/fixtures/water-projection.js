import {makeReflector} from '/app/vendor/three-water/Reflector.js';
import {makeRefractor} from '/app/vendor/three-water/Refractor.js';
import {makeWater} from '/app/vendor/three-water/Water.js';

// Known physical marker positions prove reflection alignment independently of
// the habitat's appearance. No production model, shader or camera is patched.
export function verifyWaterProjection(renderer,T){
 const prior={target:renderer.getRenderTarget(),encoding:renderer.outputEncoding,tone:renderer.toneMapping};
 const scene=new T.Scene();scene.background=new T.Color(0x050505);
 const Water=makeWater({...T,Reflector:makeReflector(T),Refractor:makeRefractor(T)});
 const normal=new T.DataTexture(new Float32Array([.5,.5,1,1]),1,1,T.RGBAFormat,T.FloatType);normal.needsUpdate=true;
 const water=new Water(new T.PlaneGeometry(40,40),{normalMap0:normal,normalMap1:normal,reflectivity:.999,depthTexture:true,textureWidth:512,textureHeight:512});
 water.rotation.x=-Math.PI/2;water.position.set(7,5,-9);scene.add(water);
 const geometry=new T.SphereGeometry(.26,24,12),material=new T.MeshBasicMaterial({color:0xff0000}),marker=new T.Mesh(geometry,material);scene.add(marker);
 const target=new T.WebGLRenderTarget(640,400,{depthBuffer:true});const camera=new T.PerspectiveCamera(62,1.6,.04,100);
 const cases=[];
 try{
  renderer.outputEncoding=T.LinearEncoding;renderer.toneMapping=T.NoToneMapping;
  for(const depth of [true,false])for(const side of [-1,1])for(const yaw of [-.6,.15,.7]){
   if(depth)water.material.defines.DEPTH_OPTICS='';else delete water.material.defines.DEPTH_OPTICS;water.material.needsUpdate=true;
   marker.position.set(6,5+side*2,-10);
   const mirrored=marker.position.clone();mirrored.y=10-mirrored.y;
   camera.position.set(7+Math.cos(yaw)*7,5+side*2.5,-9+Math.sin(yaw)*7);camera.lookAt(7,5,-9);camera.rotateZ(.12);camera.updateMatrixWorld(true);
   renderer.setRenderTarget(target);renderer.render(scene,camera);
   const screen=mirrored.clone().project(camera),x=Math.round((screen.x*.5+.5)*640),y=Math.round((screen.y*.5+.5)*400);
   const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,x,y,1,1,pixel);
   if(pixel[0]<150||pixel[1]>20||pixel[2]>20)throw Error(`Reflection marker misplaced: ${JSON.stringify({side,yaw,x,y,pixel:Array.from(pixel)})}`);
   cases.push({depth,side,yaw,x,y,pixel:Array.from(pixel)});
  }
  return {cases,scope:'Twelve off-axis and rolled views across depth and fallback shaders; physical reflected-marker pixel alignment'};
 }finally{
  renderer.setRenderTarget(prior.target);renderer.outputEncoding=prior.encoding;renderer.toneMapping=prior.tone;
  water.dispose();water.geometry.dispose();normal.dispose();geometry.dispose();material.dispose();target.dispose();
 }
}
