// A bounded surface sweep. It follows the body's local transform, so rebasing
// and orbital motion need no separate position owner or screen-space overlay.
export function createMissionScanVisual(THREE,{radius,color}){
 if(!Number.isFinite(radius)||radius<=0)return null;
 const group=new THREE.Group();
 const material=new THREE.ShaderMaterial({
  uniforms:{scanProgress:{value:0},scanColor:{value:new THREE.Color(color)}},
  vertexShader:'varying vec3 scanPosition; void main(){scanPosition=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform float scanProgress; uniform vec3 scanColor; varying vec3 scanPosition;
   void main(){
    float latitude=normalize(scanPosition).y;
    float front=mix(-0.96,0.96,scanProgress);
    float band=1.0-smoothstep(0.015,0.07,abs(latitude-front));
    float fade=smoothstep(0.0,0.1,scanProgress)*(1.0-smoothstep(0.85,1.0,scanProgress));
    float alpha=band*fade*0.65;
    if(alpha<0.004)discard;
    gl_FragColor=vec4(scanColor,alpha);
   }`,
  transparent:true,depthTest:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending
 });
 group.add(new THREE.Mesh(new THREE.SphereGeometry(radius*1.008,40,24),material));
 return group;
}
export function updateMissionScanVisual(group,progress){
 const bounded=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):1;
 for(const child of group.children)if(child.material?.uniforms?.scanProgress)child.material.uniforms.scanProgress.value=bounded;
}
