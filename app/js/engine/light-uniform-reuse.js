// Three r128 revisits programs during opaque depth sorting. Each WebGL
// program already retains its numeric light uniforms across those switches.
// Restrict reuse to one renderer.render view and the same light-state object.
// Texture/sampler uniforms are excluded because texture-unit bindings differ.
export function installRenderLightUniformReuse(ctx) {
  const renderer=ctx.renderer,marker=Symbol.for('WorldExplorer.renderLightUniformReuse');
  if(renderer[marker])return renderer[marker];
  const original=renderer.render,originalDispose=renderer.dispose,seen=new WeakSet(),setters=new WeakMap(),used=[];
  const names=['directionalLights','pointLights','spotLights','hemisphereLights','rectAreaLights'];
  let epoch=0,enabled=true,allowed=false,calls=0,skipped=0,wrapped=0;
  function prepare(){
    for(const program of renderer.info.programs){
      if(seen.has(program))continue;seen.add(program);
      const uniforms=program.getUniforms().map;
      for(const name of names){
        const uniform=uniforms[name];if(!uniform)continue;
        const set=uniform.setValue,state={epoch:-1,value:null};wrapped++;
        const wrappedSetter=function(gl,value,textures){
          calls++;
          if(enabled&&allowed){
            if(state.epoch===epoch&&state.value===value){skipped++;return;}
            if(state.epoch!==epoch)used.push(state);
            state.epoch=epoch;state.value=value;
          }
          return set.call(this,gl,value,textures);
        };
        uniform.setValue=wrappedSetter;setters.set(uniform,{original:set,wrapped:wrappedSetter});
      }
    }
  }
  const render=function(scene,camera){
    const priorAllowed=allowed;
    // ArrayCamera renders several views within one render invocation.
    allowed=!camera?.isArrayCamera;epoch++;prepare();
    try{return original.call(this,scene,camera);}
    finally{
      epoch++;allowed=priorAllowed;
      for(const state of used)state.value=null;
      used.length=0;
    }
  };
  renderer.render=render;
  let disposed=false;
  const control={
    setEnabled(value){if(!disposed){enabled=!!value;epoch++;}},
    snapshot(){return {calls,skipped,wrapped};},
    dispose(){
      if(disposed)return;disposed=true;enabled=false;allowed=false;epoch++;
      for(const state of used)state.value=null;used.length=0;
      for(const program of renderer.info.programs){
        if(!seen.has(program))continue;
        const uniforms=program.getUniforms().map;
        for(const name of names){
          const uniform=uniforms[name],entry=uniform&&setters.get(uniform);
          if(entry&&uniform.setValue===entry.wrapped)uniform.setValue=entry.original;
        }
      }
      if(renderer.render===render)renderer.render=original;
      if(renderer.dispose===disposeRenderer)renderer.dispose=originalDispose;
      delete renderer[marker];
    }
  };
  function disposeRenderer(){control.dispose();return originalDispose.call(this);}
  if(typeof originalDispose==='function')renderer.dispose=disposeRenderer;
  renderer[marker]=control;
  return control;
}
