// One occupied interior owns the visitor camera and light visibility. The
// outdoor weather system retains light values, which must not be rolled back.
export function acquireVenueLighting(ctx,root,layer=1){
 const camera=ctx.camera,mask=camera?.layers?.mask,scene=ctx.scene,environment=scene?.environment;
 if(scene)scene.environment=null;
 const lights=[ctx.sun,ctx.hemiLight,ctx.fillLight,ctx.ambientLight].filter(Boolean).map(light=>({light,visible:light.visible}));
 const refreshShadows=()=>{
  if(ctx.renderer?.shadowMap)ctx.renderer.shadowMap.needsUpdate=true;
  root.traverse(o=>{if(o.isLight&&o.castShadow&&o.shadow){o.shadow.camera.layers.set(layer);o.shadow.needsUpdate=true;}});
 };
 const apply=object=>{object.traverse(o=>o.layers.set(layer));refreshShadows();};
 apply(root);camera?.layers?.set(layer);lights.forEach(({light})=>{light.visible=false;});
 // The engine disables automatic shadow updates. Publish the occupied venue
 // on entry and after a model attaches, then publish the outdoor view on exit.
 let released=false;return {apply,refreshShadows,release(){if(released)return;released=true;if(camera?.layers&&Number.isInteger(mask))camera.layers.mask=mask;lights.forEach(({light,visible})=>{light.visible=visible;});if(scene)scene.environment=Object.hasOwn(ctx,'earthEnvironmentMap')?ctx.earthEnvironmentMap:environment;if(ctx.renderer?.shadowMap)ctx.renderer.shadowMap.needsUpdate=true;}};
}
