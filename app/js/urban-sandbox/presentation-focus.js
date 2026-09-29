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

// Reacting NPCs remain authoritative until their incident ends. Their distant
// rigs need not animate or propagate hundreds of bone matrices while retained.
export function setRetainedNpcPresentation(root, actor, radius = 330) {
  if (!root || !actor) return true;
  const visible = urbanPresentationDistance(actor, root.position) <= radius;
  if (!root.userData.retainedNpcMatrixUpdate) {
    const update = root.updateMatrixWorld;
    root.userData.retainedNpcMatrixUpdate = true;
    root.updateMatrixWorld = function (force) {
      if (this.visible) return update.call(this, force);
    };
  }
  if (visible && !root.visible) root.matrixWorldNeedsUpdate = true;
  root.visible = visible;
  return visible;
}
