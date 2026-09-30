// Diagnostic only: omit zero-intensity local lights while rendering, without
// changing their owners, intensity, pool membership, or gameplay-visible state.
export function installInactiveLightExperiment(ctx) {
  const renderer=ctx.renderer,original=renderer.render,entries=[];
  ctx.scene.traverse(o=>{if(o.isPointLight||o.isSpotLight)entries.push(o);});
  let enabled=false;
  renderer.render=function(scene,camera){
    if(!enabled||scene!==ctx.scene)return original.call(this,scene,camera);
    const hidden=[];
    for(const light of entries)if(light.visible&&light.intensity===0){light.visible=false;hidden.push(light);}
    try{return original.call(this,scene,camera);}finally{for(const light of hidden)light.visible=true;}
  };
  return {count:entries.length,setEnabled(value){enabled=value;},dispose(){renderer.render=original;}};
}
