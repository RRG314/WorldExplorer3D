// Exposure compensation for the render lights only. Physical irradiance,
// temperature and gravity remain in the physical-environment authority.
export function surfaceLightingGain({sunIntensity=0,ambientIntensity=0,fillIntensity=0}) {
  const total=Math.max(0,sunIntensity)+Math.max(0,ambientIntensity)+Math.max(0,fillIntensity);
  return total>0 ? Math.max(1,2.4/total) : 1;
}

// Scene owners restore the exact incoming light state when leaving a surface.
export function captureSurfaceLightPresentation(context, {surfaceEnvironment = null} = {}) {
  const environment=context.scene?.environment;
  const exposure=context.renderer?.toneMappingExposure;
  const saved = ['sun','ambientLight','fillLight','hemiLight'].map(key => {
    const light=context[key];
    return light ? {light,visible:light.visible,intensity:light.intensity,color:light.color?.clone(),position:light.position?.clone()} : null;
  }).filter(Boolean);
  if(surfaceEnvironment && context.scene)context.scene.environment=surfaceEnvironment;
  let restored=false;
  return () => {
    if(restored)return;
    restored=true;
    if(context.scene)context.scene.environment=environment;
    surfaceEnvironment?.dispose();
    if(context.renderer && Number.isFinite(exposure))context.renderer.toneMappingExposure=exposure;
    saved.forEach(({light,visible,intensity,color,position})=>{
    light.visible=visible;light.intensity=intensity;
    if(color)light.color.copy(color);if(position)light.position.copy(position);
  });
  };
}

// Small local sky/ground reflection field for metallic surface equipment.
// This is display lighting, not measured irradiance or Earth's blue sky.
export function createSurfaceReflectionEnvironment(three, {sky=0x9b6751,ground=0x704535} = {}) {
  const width=128,height=64,data=new Uint8Array(width*height*4);
  const upper=new three.Color(sky),lower=new three.Color(ground),color=new three.Color();
  for(let y=0;y<height;y++){
    const mix=Math.max(0,Math.min(1,(y/(height-1)-.4)/.2));
    color.copy(lower).lerp(upper,mix);
    for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=Math.round(color.r*255);data[i+1]=Math.round(color.g*255);data[i+2]=Math.round(color.b*255);data[i+3]=255;}
  }
  const texture=new three.DataTexture(data,width,height,three.RGBAFormat);
  texture.name='Surface sky and ground reflections';
  texture.mapping=three.EquirectangularReflectionMapping;
  texture.minFilter=texture.magFilter=three.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}
