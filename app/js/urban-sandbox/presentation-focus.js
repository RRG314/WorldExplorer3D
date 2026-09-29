// Visual detail follows the vehicle/camera being used. Civic simulation keeps
// its own player authority; flying a drone does not move the player's body.
export function urbanPresentationFocus(activeActor, groundActor) {
  return activeActor || groundActor;
}
export function urbanPresentationDistance(actor, entity) {
  const vertical = ['plane','drone'].includes(actor?.source) && Number.isFinite(actor.y) && Number.isFinite(entity?.y)
    ? entity.y-actor.y : 0;
  return Math.hypot(entity.x-actor.x,entity.z-actor.z,vertical);
}
