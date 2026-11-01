import {validatePhoneOptics,phoneEyeProjection} from './phone-optics.js';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

// Borrow one renderer; own only the two eye cameras, target and distortion
// pass. Canonical world geometry/actors retain their existing units and owners.
export function createPhoneStereo({THREE,renderer,optics,worldUnitsPerMeter,maxWidth=1920}){
  const profile=validatePhoneOptics(optics);
  if(!(worldUnitsPerMeter>0&&Number.isFinite(worldUnitsPerMeter)))throw new TypeError('Stereo requires the current world’s physical scale.');
  if(!Number.isFinite(maxWidth)||maxWidth<320||maxWidth>4096)throw new TypeError('Invalid phone stereo resolution budget.');
  const scope=createLifecycleScope('vr-phone-stereo'),target=new THREE.WebGLRenderTarget(2,2,{depthBuffer:true,stencilBuffer:false});
  target.texture.generateMipmaps=false;target.texture.minFilter=THREE.LinearFilter;target.texture.magFilter=THREE.LinearFilter;
  scope.defer(()=>target.dispose(),'render-target');
  const eyes=['left','right'].map(name=>({camera:new THREE.PerspectiveCamera(),projection:phoneEyeProjection(profile,name)}));
  const uniforms={source:{value:target.texture},screenSize:{value:new THREE.Vector2(profile.screenWidth,profile.screenHeight)},
    lens:{value:new THREE.Vector3(profile.lensSeparation,profile.lensY,profile.lensDistance)},
    coefficients:{value:new THREE.Vector2(...profile.distortion)},
    leftFov:{value:new THREE.Vector4(eyes[0].projection.left,eyes[0].projection.right,eyes[0].projection.bottom,eyes[0].projection.top)}};
  const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:`uniform sampler2D source; uniform vec2 screenSize; uniform vec3 lens; uniform vec2 coefficients; uniform vec4 leftFov; varying vec2 vUv;
      void main(){
        float eye=step(0.5,vUv.x); float lensX=(screenSize.x+mix(-lens.x,lens.x,eye))*0.5;
        vec2 p=(vUv*screenSize-vec2(lensX,lens.y))/lens.z;
        float r2=dot(p,p); p*=1.0+coefficients.x*r2+coefficients.y*r2*r2;
        vec4 fov=mix(leftFov,leftFov.yxzw,eye);
        vec2 uv=(p+fov.xz)/vec2(fov.x+fov.y,fov.z+fov.w);
        if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}
        float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
        gl_FragColor=texture2D(source,vec2((uv.x+eye)*0.5,uv.y))*smoothstep(0.0,0.025,edge);
        gl_FragColor.a=1.0;
        #include <encodings_fragment>
      }`});
  scope.defer(()=>geometry.dispose(),'geometry');scope.defer(()=>material.dispose(),'material');
  const screen=new THREE.Scene();screen.add(new THREE.Mesh(geometry,material));const screenCamera=new THREE.Camera();
  const size=new THREE.Vector2(),previousViewport=new THREE.Vector4(),previousScissor=new THREE.Vector4();
  let disposed=false,width=0,height=0;
  function render(scene,camera){
    if(disposed)throw new Error('Phone stereo presentation has ended.');
    if(renderer.xr?.isPresenting)throw new Error('Tracked VR already owns this renderer.');
    renderer.getDrawingBufferSize(size);
    const scale=Math.min(1,maxWidth/size.x),wantedWidth=Math.max(2,2*Math.floor(size.x*scale/2)),wantedHeight=Math.max(1,Math.floor(size.y*scale));
    if(wantedWidth!==width||wantedHeight!==height){width=wantedWidth;height=wantedHeight;target.setSize(width,height);}
    const previousTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();
    renderer.getViewport(previousViewport);renderer.getScissor(previousScissor);
    camera.updateWorldMatrix(true,false);
    try{
      renderer.autoClear=false;target.scissorTest=false;renderer.setRenderTarget(target);renderer.clear();
      for(let index=0;index<eyes.length;index++){
        const {camera:eye,projection:p}=eyes[index],near=.03*worldUnitsPerMeter,far=Math.max(camera.far,near+1);
        eye.position.set(p.eyeOffset*worldUnitsPerMeter,0,0).applyMatrix4(camera.matrixWorld);camera.getWorldQuaternion(eye.quaternion);
        eye.near=near;eye.far=far;eye.layers.mask=camera.layers.mask;
        eye.projectionMatrix.makePerspective(-p.left*near,p.right*near,p.top*near,-p.bottom*near,near,far);
        eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();eye.updateMatrixWorld(true);
        // Render-target rectangles use physical pixels. renderer.setViewport /
        // setScissor multiply CSS coordinates by DPR in Three r128.
        target.viewport.set(index*width/2,0,width/2,height);target.scissor.copy(target.viewport);target.scissorTest=true;renderer.setRenderTarget(target);
        renderer.render(scene,eye);
      }
      renderer.setRenderTarget(null);renderer.setScissorTest(false);renderer.setViewport(0,0,size.x/renderer.getPixelRatio(),size.y/renderer.getPixelRatio());renderer.clear();renderer.render(screen,screenCamera);
    }finally{
      renderer.setRenderTarget(previousTarget);renderer.setViewport(previousViewport);renderer.setScissor(previousScissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;
    }
  }
  return Object.freeze({render,snapshot:()=>({active:!disposed,width,height,eyeSeparationWorld:profile.eyeSeparation*worldUnitsPerMeter}),
    dispose(){if(disposed)return;disposed=true;screen.clear();scope.dispose('phone stereo ended');}});
}
