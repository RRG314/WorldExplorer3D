function createMarineState() {
  return { marineSnapshot:null, marineLoadedAt:0, marineQueryKey:'', marineLoading:false,
    marineError:'', marineRequestToken:0, marinePending:null };
}
function cancelSelectedMarineData(state) {
  state.marineRequestToken=(Number(state.marineRequestToken)||0)+1;
  state.marinePending?.controller.abort();
  state.marinePending=null;
  state.marineLoading=false;
}
function ensureSelectedMarineData(ctx, state, force = false) {
  const selected=ctx.selectorSelection(state);
  if (!Number.isFinite(selected?.lat) || !Number.isFinite(selected?.lon)) {
    cancelSelectedMarineData(state);
    state.marineSnapshot=null;state.marineLoadedAt=0;state.marineQueryKey='';
    state.marineError='Choose a point on the globe before checking marine conditions.';
    return Promise.resolve(null);
  }
  const queryKey=`${selected.lat.toFixed(4)}:${selected.lon.toFixed(4)}`;
  if (state.marinePending?.key===queryKey) return state.marinePending.promise;
  if (state.marinePending) cancelSelectedMarineData(state);
  // The shortest underlying marine observation TTL is five minutes.
  if (!force && queryKey===state.marineQueryKey && state.marineSnapshot && state.marineLoadedAt>0 && Date.now()-state.marineLoadedAt<300000) return Promise.resolve(state.marineSnapshot);
  const token=++state.marineRequestToken, controller=new AbortController();
  state.marineLoading=true;state.marineError='';
  if (queryKey!==state.marineQueryKey) state.marineSnapshot=null;
  const promise=Promise.resolve().then(()=>ctx.marineService.selected({lat:selected.lat,lon:selected.lon},{force,signal:controller.signal})).then(snapshot=>{
    if (token!==state.marineRequestToken) return state.marineSnapshot;
    state.marineSnapshot=snapshot;state.marineQueryKey=queryKey;state.marineLoadedAt=Date.now();
    if (!snapshot.model&&!snapshot.station) {
      state.marineError=snapshot.warnings[0]||'Marine data is unavailable for this selection.';
      state.marineLoadedAt=0;
    }
    return snapshot;
  }).catch(error=>{
    if (token!==state.marineRequestToken) return state.marineSnapshot;
    state.marineSnapshot=null;state.marineQueryKey=queryKey;state.marineLoadedAt=0;
    state.marineError=error?.message||'Marine data is unavailable right now.';
    return null;
  }).finally(()=>{if(token===state.marineRequestToken){state.marineLoading=false;state.marinePending=null;}});
  state.marinePending={key:queryKey,controller,promise};
  return promise;
}
export { createMarineState, ensureSelectedMarineData, cancelSelectedMarineData };
