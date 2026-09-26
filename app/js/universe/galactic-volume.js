// Morphology-informed, navigable reconstruction. No claim of measured 3D dust.
export function createGalacticVolume(THREE,entity,{region=false,mobile=false}={}){
 const radius=region?14500:950;
 const material=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,depthTest:false,side:THREE.BackSide,
  uniforms:{observer:{value:new THREE.Vector3()},seed:{value:Number(entity.visualProfile?.seed||1)%997},arms:{value:Number(entity.visualProfile?.arms||2)},region:{value:region?1:0}},
  vertexShader:'varying vec3 pLocal;void main(){pLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`precision highp float;
   varying vec3 pLocal;uniform vec3 observer;uniform float seed;uniform float arms;uniform float region;
   float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+seed)*43758.5453);}
   float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
   void main(){
    vec3 dir=normalize(pLocal-observer),safe=sign(dir+vec3(.000001))*max(abs(dir),vec3(.000001));
    vec3 a=(-vec3(1.)-observer)/safe,b=(vec3(1.)-observer)/safe,lo=min(a,b),hi=max(a,b);
    float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));if(end<=start)discard;
    float ds=(end-start)/float(${mobile?40:64}),transmission=1.;vec3 color=vec3(0.);
    for(int i=0;i<${mobile?40:64};i++){
     vec3 p=observer+dir*(start+(float(i)+.5)*ds);float r=length(p.xz);
     float envelope=(1.-smoothstep(.72,1.,r))*exp(-abs(p.y)*mix(22.,4.,region));
     float phase=atan(p.z,p.x)-r*10.;float arm=pow(.5+.5*cos(phase*arms),8.);
     float broad=noise(p*mix(14.,4.,region)),fine=noise(p*mix(38.,12.,region));
     float clusters=smoothstep(.43,.82,broad*.7+fine*.3);
     float bulge=exp(-dot(p*vec3(1.,2.4,1.),p*vec3(1.,2.4,1.))*45.);
     float disk=(.1+arm*.9)*envelope*(.3+clusters*.7);
     float regional=envelope*(.08+clusters*.92);
     float density=mix(disk+bulge*.6,regional,region);
     float alpha=1.-exp(-density*ds*mix(8.,2.2,region));
     vec3 warm=vec3(.85,.53,.23),blue=vec3(.19,.31,.54),gas=vec3(.45,.12,.23);
     vec3 glow=mix(blue,gas,smoothstep(.56,.84,fine));glow=mix(glow,warm,clamp(bulge*2.,0.,1.));
     float dust=smoothstep(.38,.67,noise(p*23.+vec3(17.)))*envelope;
     color+=transmission*alpha*glow*(1.-dust*.65);transmission*=1.-alpha;
     if(transmission<.02)break;
    }
    float opacity=1.-transmission;if(opacity<.002)discard;
    gl_FragColor=vec4(color/max(opacity,.001),opacity);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
   }`
 });
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material);mesh.scale.setScalar(radius);mesh.renderOrder=-500;mesh.frustumCulled=false;
 mesh.name=`${entity.name}: reconstructed ${region?'stellar clouds':'galactic disk, arms and dust'}`;
 mesh.userData={reconstruction:true,source:'catalog morphology; procedural unresolved depth',integrationSteps:mobile?40:64};
 mesh.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(material.uniforms.observer.value);mesh.worldToLocal(material.uniforms.observer.value);};
 return mesh;
}
