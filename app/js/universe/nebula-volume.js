// Bounded emission/absorption integration through a world-anchored density field.
// Observational images remain in the distant sky; this depth is a reconstruction,
// not measured tomography or a naked-eye claim. No animated density or billboard planes.
export function createNebulaVolume(THREE, entity, mobile = false) {
  const radius = Number(entity.visualProfile?.navigationRadiusScene) || 9000;
  const image = new THREE.TextureLoader().load(entity.visualProfile.densityImage || entity.visualProfile.image);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide,
    uniforms: {
      observation: { value: image },
      observer: { value: new THREE.Vector3() },
      tint: { value: new THREE.Color(entity.visualProfile?.tint || 0x9bbcff) },
      seed: { value: Number(entity.visualProfile?.seed || 1) % 997 },
      shell: { value: entity.id.includes('crab') ? 1 : 0 }
    },
    vertexShader: `varying vec3 localPosition;
      void main() { localPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision highp float;
      varying vec3 localPosition;
      uniform sampler2D observation;
      uniform vec3 observer; uniform vec3 tint; uniform float seed; uniform float shell;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))+seed)*43758.5453); }
      float noise3(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 direction=normalize(localPosition-observer);
        vec3 safeDirection=sign(direction+vec3(0.000001))*max(abs(direction),vec3(0.000001));
        vec3 a=(-vec3(1.0)-observer)/safeDirection, b=(vec3(1.0)-observer)/safeDirection;
        vec3 lo=min(a,b), hi=max(a,b);
        float enter=max(0.0,max(lo.x,max(lo.y,lo.z)));
        float leave=min(hi.x,min(hi.y,hi.z));
        if(leave<=enter) discard;
        float stepSize=(leave-enter)/float(${mobile ? 20 : 32});
        vec3 emission=vec3(0.0); float transmission=1.0;
        for(int i=0;i<${mobile ? 20 : 32};i++) {
          vec3 p=observer+direction*(enter+(float(i)+0.5)*stepSize);
          float radial=length(p*vec3(1.0,1.45,1.0));
          float envelope=1.0-smoothstep(0.60,1.0,radial);
          // A photograph is a 2D projection, not a density slice. Extruding its
          // brightness along z creates long luminous columns when flown through.
          // Reconstruct bounded 3D filaments; use the image only for broad color.
          vec3 warp=vec3(noise3(p*3.1+seed),noise3(p*3.1+17.0),noise3(p*3.1-29.0))-.5;
          vec3 q=p*7.0+warp*2.0;
          float broad=noise3(q);
          float fine=noise3(q*2.4+11.0);
          float ridge=1.0-abs(2.0*(broad*.72+fine*.28)-1.0);
          float filament=pow(smoothstep(.58,.96,ridge),3.0);
          vec2 imageUv=clamp(p.xy*.42+.5+warp.xy*.12,0.001,0.999);
          vec3 observed=pow(texture2D(observation,imageUv).rgb,vec3(2.2));
          float density=(.06+filament*.94)*envelope;
          if(shell>0.5) density*=smoothstep(.22,.48,radial);
          else density*=.2+.8*smoothstep(.08,.42,length(p-vec3(.12,0.0,.08)));
          float absorbed=1.0-exp(-density*stepSize*2.8);
          vec3 color=mix(tint*0.035,observed*1.8,0.9);
          emission+=transmission*absorbed*color;
          transmission*=1.0-absorbed;
          if(transmission<0.02) break;
        }
        float alpha=1.0-transmission;
        if(alpha<0.002) discard;
        gl_FragColor=vec4(emission/max(alpha,0.001),alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`
  });
  // Scene disposal owns this image, unlike shared model-template textures.
  material.map = image;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.name = `${entity.name} reconstructed gas and dust volume`;
  mesh.scale.setScalar(radius);
  mesh.renderOrder = -500;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(material.uniforms.observer.value);
    mesh.worldToLocal(material.uniforms.observer.value);
  };
  mesh.userData = { reconstruction: true, integrationSteps: mobile ? 20 : 32, physicalRadiusLy: entity.physical?.radiusLy };
  return mesh;
}
