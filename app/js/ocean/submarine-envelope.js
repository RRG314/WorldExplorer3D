// Measured author-model bounds in metres, before the runtime's uniform scale.
// YXZ rotation makes the vertical support independent of heading.
export const SUBMARINE_BOUNDS = Object.freeze({
  min: Object.freeze([-1.619477, -1.487754, -4.055058]),
  max: Object.freeze([1.619510, 1.788543, 4.052834])
});
export function submarineVerticalClearance(pitch = 0, roll = 0, scale = .86) {
  const weights = [Math.cos(pitch) * Math.sin(roll), Math.cos(pitch) * Math.cos(roll), -Math.sin(pitch)];
  let lower = 0, upper = 0;
  for (let axis = 0; axis < 3; axis++) {
    const a = weights[axis] * SUBMARINE_BOUNDS.min[axis] * scale;
    const b = weights[axis] * SUBMARINE_BOUNDS.max[axis] * scale;
    lower += Math.min(a,b); upper += Math.max(a,b);
  }
  return {below: -lower + .2, above: upper + .2};
}
