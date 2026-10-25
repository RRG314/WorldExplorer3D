// Controlled compositor boundary for browser integration. This is NOT a native
// XR runtime or hardware acceptance. Actual app renderer, views and kernel run.
export function installControlledXrRuntime({target=window,THREE,renderer,width=1280,height=720,cant=.2}){
  const gl=renderer.getContext(),oldXr=Object.getOwnPropertyDescriptor(target.navigator,'xr'),oldLayer=target.XRWebGLLayer,oldCompatible=gl.makeXRCompatible;
  const sessions=[],layers=[];let sequence=0,lastSession=null;
  gl.makeXRCompatible=async()=>{};
  class Layer{
    constructor(session){
      this.framebufferWidth=width;this.framebufferHeight=height;this.framebuffer=gl.createFramebuffer();this.texture=gl.createTexture();this.depth=gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);
      gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Controlled XR framebuffer is incomplete.');
      renderer.resetState();renderer.setRenderTarget(null);layers.push(this);session.layer=this;
    }
    getViewport(view){return {x:view.eye==='left'?0:width/2,y:0,width:width/2,height};}
    dispose(){gl.deleteFramebuffer(this.framebuffer);gl.deleteTexture(this.texture);gl.deleteRenderbuffer(this.depth);renderer.resetState();renderer.setRenderTarget(null);}
  }
  class Session extends EventTarget{
    visibilityState='visible';inputSources=[];renderState={depthNear:.05,depthFar:100};callbacks=new Map();reference=new EventTarget();ended=false;
    requestReferenceSpace=async()=>this.reference;
    updateRenderState=value=>Object.assign(this.renderState,value);
    requestAnimationFrame=callback=>{if(this.ended)throw Error('Controlled session ended.');const id=++sequence;this.callbacks.set(id,callback);return id;};
    cancelAnimationFrame=id=>this.callbacks.delete(id);
    async end(){if(this.ended)return;this.ended=true;this.callbacks.clear();this.dispatchEvent(new Event('end'));this.layer?.dispose();}
  }
  Object.defineProperty(target.navigator,'xr',{configurable:true,value:{isSessionSupported:async mode=>mode==='immersive-vr',requestSession:async()=>{lastSession=new Session();sessions.push(lastSession);return lastSession;}}});target.XRWebGLLayer=Layer;
  function makePose({position=[0,1.6,0],quaternion=[0,0,0,1]}={}){
    const q=new THREE.Quaternion().fromArray(quaternion),p=new THREE.Vector3().fromArray(position),one=new THREE.Vector3(1,1,1),base=new THREE.Matrix4().compose(p,q,one),native=lastSession.renderState;
    const projection=new THREE.Matrix4().makePerspective(-native.depthNear,native.depthNear,native.depthNear*.9,-native.depthNear*.9,native.depthNear,native.depthFar).toArray();
    return {transform:{matrix:base.toArray()},views:[-1,1].map(sign=>({eye:sign<0?'left':'right',projectionMatrix:projection,
      transform:{matrix:base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(sign*.032,0,0),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign*cant),one)).toArray()}}))};
  }
  return {
    get session(){return lastSession;},
    step(timestamp,options){const session=lastSession,[id,callback]=session.callbacks.entries().next().value||[];if(!callback)throw Error('No controlled XR frame is pending.');session.callbacks.delete(id);callback(timestamp,{session,getViewerPose:()=>options===null?null:makePose(options)});},
    select({origin=[0,1.6,0],quaternion=[0,0,0,1],mode='transient-pointer'}={}){
      const event=new Event('select'),inputSource={targetRayMode:mode,targetRaySpace:{}};
      Object.assign(event,{inputSource,frame:{getPose:()=>({transform:{matrix:new THREE.Matrix4().compose(new THREE.Vector3().fromArray(origin),new THREE.Quaternion().fromArray(quaternion),new THREE.Vector3(1,1,1)).toArray()}})}});lastSession.dispatchEvent(event);
    },
    capture(){
      const pixels=new Uint8Array(width*height*4),previousTarget=renderer.getRenderTarget();
      try{renderer.state.bindXRFramebuffer(lastSession.layer.framebuffer);renderer.setRenderTarget(null);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);}finally{renderer.state.bindXRFramebuffer(null);renderer.setRenderTarget(previousTarget);}
      const counts=[0,0];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4;if(pixels[at+1]>150&&pixels[at]<130&&pixels[at+2]<130)counts[x<width/2?0:1]++;}
      const canvas=target.document.createElement('canvas');canvas.width=width;canvas.height=height;const draw=canvas.getContext('2d'),image=draw.createImageData(width,height);
      for(let y=0;y<height;y++)image.data.set(pixels.subarray(y*width*4,(y+1)*width*4),(height-y-1)*width*4);draw.putImageData(image,0,0);
      return {counts,image:canvas.toDataURL('image/png'),glError:gl.getError()};
    },
    async dispose(){for(const session of sessions)await session.end();gl.makeXRCompatible=oldCompatible;target.XRWebGLLayer=oldLayer;if(oldXr)Object.defineProperty(target.navigator,'xr',oldXr);else delete target.navigator.xr;}
  };
}
