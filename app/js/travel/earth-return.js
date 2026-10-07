// Menu returns are complete environment handoffs. Merely committing EARTH
// leaves the previous renderer/actor and a possibly released Earth publication.
export function createEarthReturnAction({ctx,exitEnvironment,resumeEarth}) {
  let pending=null;
  return function returnToEarthFromMenu() {
    if(pending)return pending;
    pending=(async()=>{
      try {
        exitEnvironment(ctx.ENV.EARTH,{source:'earth_menu'});
        const result=await resumeEarth({transitionDurationMs:700});
        if(result?.aborted)return false;
        ctx.updateControlsModeUI?.();
        return true;
      } catch(error) {
        console.warn('[earth-return] Earth restoration failed.',error);
        ctx.showToast?.('Earth could not finish loading. Open the location menu and try again.');
        return false;
      }
    })().finally(()=>{pending=null;});
    return pending;
  };
}
