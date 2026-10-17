// Browser evaluator for explicit test setup, never imported by gameplay.
// Observe the real mode button, then place the actor in that same event task.
// No frame may see the temporary distant position produced by mode switching.
export function installTravelTestPlacement({mode, selector, route}) {
  const ctx = globalThis.__WE3D_PERF_CONTEXT__;
  const button = document.querySelector(selector);
  if (!button || !['walk', 'drive', 'plane'].includes(mode) || route.points.length < 2) {
    throw new Error('A visible mode action and a complete test route are required');
  }
  const snapshot = () => ({
    mode: ctx.activeTransportActor()?.mode,
    paused: ctx.paused,
    pavementGeneration: ctx._streetPavementGeneration,
    pavementFocus: ctx.streetPavement?.focus ? {...ctx.streetPavement.focus} : null
  });
  const witness = {before: null, after: null, error: null};
  const capture = () => { witness.before = snapshot(); };
  const place = () => {
    try {
      if (ctx.activeTransportActor()?.mode !== mode) throw new Error('Mode did not activate within its click task');
      const actor = mode === 'walk' ? ctx.Walk.state.walker : mode === 'drive' ? ctx.car : ctx.planeMode;
      const p = mode === 'plane' ? {x:750,z:0} : route.points[0], next = route.points[1];
      const yaw = mode === 'plane' ? 0 : Math.atan2(next.x-p.x, next.z-p.z);
      Object.assign(actor,{x:p.x,z:p.z,yaw,angle:yaw,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,lookYawOffset:0,cameraYaw:0,cameraPitch:0,cameraLookTimer:0});
      if (mode === 'plane') Object.assign(actor,{y:220,speed:80,horizontalSpeed:80,vx:0,vy:0,vz:80,throttle:1,airborne:true,stalled:false,flightPathAngle:0,climbRate:0,turnRate:0,angleOfAttack:0,barrelRollActive:false});
      else Object.assign(actor,{y:mode==='walk'?ctx.GroundHeight.walkSurfaceY(p.x,p.z)+1.7:ctx.GroundHeight.carCenterY(p.x,p.z),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,onGround:true,isAirborne:false});
      globalThis.__WE3D_TRAVEL_ACTOR__ = actor;
      witness.after = {...snapshot(),position:{x:actor.x,y:actor.y,z:actor.z}};
    } catch (error) { witness.error = error.message; }
  };
  button.addEventListener('click', capture, {capture:true,once:true});
  button.addEventListener('click', place, {once:true});
  witness.dispose = () => {
    button.removeEventListener('click', capture, true);
    button.removeEventListener('click', place);
  };
  return witness;
}
