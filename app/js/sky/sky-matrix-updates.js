// The daytime sky is retained for night and planetary transitions. Three r128
// updates invisible descendants too; defer that work until this sky is shown.
// Explicit world-space queries still use Three's unchanged updateWorldMatrix.
export function deferHiddenSkyMatrixUpdates(group) {
  const update = group.updateMatrixWorld;
  let deferred = false;
  group.updateMatrixWorld = function(force) {
    if (!this.visible) {
      deferred = true;
      return;
    }
    update.call(this, force || deferred);
    deferred = false;
  };
  return group;
}
