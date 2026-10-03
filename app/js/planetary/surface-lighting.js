// Exposure compensation for the render lights only. Physical irradiance,
// temperature and gravity remain in the physical-environment authority.
export function surfaceLightingGain({sunIntensity=0,ambientIntensity=0,fillIntensity=0}) {
  const total=Math.max(0,sunIntensity)+Math.max(0,ambientIntensity)+Math.max(0,fillIntensity);
  return total>0 ? Math.max(1,2.4/total) : 1;
}

// Scene owners restore the exact incoming light state when leaving a surface.
export function captureSurfaceLightPresentation(context) {
  const environment=context.scene?.environment;
  const exposure=context.renderer?.toneMappingExposure;
  const saved = ['sun','ambientLight','fillLight','hemiLight'].map(key => {
    const light=context[key];
    return light ? {light,visible:light.visible,intensity:light.intensity,color:light.color?.clone(),position:light.position?.clone()} : null;
  }).filter(Boolean);
  return () => {
    if(context.scene)context.scene.environment=environment;
    if(context.renderer && Number.isFinite(exposure))context.renderer.toneMappingExposure=exposure;
    saved.forEach(({light,visible,intensity,color,position})=>{
    light.visible=visible;light.intensity=intensity;
    if(color)light.color.copy(color);if(position)light.position.copy(position);
  });
  };
}
