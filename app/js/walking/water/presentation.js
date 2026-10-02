// A render-scoped override: weather keeps its own fog/sky values, and even a
// failed render restores them. No independent animation loop or postprocess.
export function beginSwimmingRender(ctx) {
  const swimming=ctx.Walk?.state?.walker?.swimming;
  const scene=ctx.scene,camera=ctx.camera,fog=scene?.fog;
  if(!swimming||ctx.getEnv?.()!=='EARTH'||!camera||camera.position.y>=swimming.surfaceY-.08||!fog?.isFogExp2)return null;
  const oldFogColor=fog.color.getHex(),oldDensity=fog.density;
  const background=scene.background,oldBackground=background?.isColor?background.getHex():null;
  const sky=[ctx.earthAtmosphere,ctx.sunSphere,ctx.moonSphere,ctx.cloudGroup,ctx.starField].filter(Boolean).map(object=>({object,visible:object.visible}));
  const depth=Math.max(0,swimming.surfaceY-camera.position.y);
  fog.color.setHex(0x164b58);fog.density=.045+Math.min(.04,depth*.002);
  if(background?.isColor)background.setHex(0x164b58);
  sky.forEach(({object})=>{object.visible=false});
  return ()=>{
    fog.color.setHex(oldFogColor);fog.density=oldDensity;
    if(oldBackground!==null)background.setHex(oldBackground);
    sky.forEach(({object,visible})=>{object.visible=visible});
  };
}
