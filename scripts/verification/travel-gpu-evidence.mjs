// Browser-only diagnostic. GPU queries are polled, never waited on or flushed.
// The outer composer/render boundary covers every pass without nested queries.
export function installTravelGpuEvidence(ctx, {passes=false}={}) {
  const gl=ctx.renderer.getContext();
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext || typeof gl.createQuery!=='function')throw Error('GPU timer unavailable');
  const pending=[],samples=[],wrapped=[];
  let depth=0,disjoint=0,skipped=0;
  const labels=new WeakMap();
  const labelFor=root=>{if(root===ctx.scene)return "world";if(!labels.has(root)){const materials=[];root.traverse?.(o=>{if(o.material)materials.push(o.material.name||o.material.type);});labels.set(root,materials.join("/")||root.type);}return labels.get(root);};
  const poll=()=>{
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
      disjoint+=pending.length;
      for(const item of pending)gl.deleteQuery(item.query);
      pending.length=0;
      return;
    }
    while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const item=pending.shift();
      item.gpuMs=gl.getQueryParameter(item.query,gl.QUERY_RESULT)/1e6;
      gl.deleteQuery(item.query);delete item.query;samples.push(item);
    }
  };
  for(const owner of (passes?[ctx.renderer]:[ctx.composer,ctx.renderer]).filter(Boolean)){
    const original=owner.render;
    const wrapper=function(...args){
      if(depth)return original.apply(this,args);
      depth++;
      let item;
      try{
        poll();
        if(pending.length<128&&samples.length<100000){
          item={query:gl.createQuery(),at:performance.now(),pass:passes?labelFor(args[0]):"whole-frame"};
          gl.beginQuery(ext.TIME_ELAPSED_EXT,item.query);
        }else skipped++;
        return original.apply(this,args);
      }finally{
        if(item){
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          item.cpuMs=performance.now()-item.at;
          item.calls=ctx.renderer.info.render.calls;
          item.triangles=ctx.renderer.info.render.triangles;
          pending.push(item);
        }
        depth--;
      }
    };
    owner.render=wrapper;wrapped.push({owner,original,wrapper});
  }
  return {finish(){
    poll();
    const unavailable=pending.length;
    for(const item of pending)gl.deleteQuery(item.query);
    for(const {owner,original,wrapper}of wrapped)if(owner.render===wrapper)owner.render=original;
    return {samples,disjoint,skipped,unavailable,scope:'Instrumented CPU submission and asynchronous whole-frame GPU time; not acceptance'};
  }};
}
