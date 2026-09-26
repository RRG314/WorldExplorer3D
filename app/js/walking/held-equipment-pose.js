// Two-bone presentation IK layered after the authored locomotion animation.
// The target is clamped to the arm's reach; this never moves the player capsule.
export function placeHand(THREE, upper, lower, wrist, target, pole) {
  if (!upper || !lower || !wrist) return false;
  upper.updateWorldMatrix(true, true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const b = lower.getWorldPosition(new THREE.Vector3());
  const c = wrist.getWorldPosition(new THREE.Vector3());
  const ab = a.distanceTo(b), bc = b.distanceTo(c);
  if (Math.min(ab, bc) < 1e-5 || target.distanceTo(a) < 1e-5) return false;
  const axis = target.clone().sub(a).normalize();
  const distance = Math.max(Math.abs(ab - bc) + 1e-4, Math.min(ab + bc - 1e-4, target.distanceTo(a)));
  const along = (ab * ab + distance * distance - bc * bc) / (2 * distance);
  const bend = pole.clone().sub(a).addScaledVector(axis, -pole.clone().sub(a).dot(axis));
  if (bend.lengthSq() < 1e-8) bend.set(0, 1, 0).addScaledVector(axis, -axis.y);
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0);
  const elbow = a.clone().addScaledVector(axis, along).addScaledVector(bend.normalize(), Math.sqrt(Math.max(0, ab * ab - along * along)));
  const end = a.clone().addScaledVector(axis, distance);
  const rotateToward = (bone, child, point) => {
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const to = point.clone().sub(origin).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
    bone.quaternion.copy(parent.invert().multiply(rotation));
    bone.updateWorldMatrix(false, true);
  };
  rotateToward(upper, lower, elbow);
  rotateToward(lower, wrist, end);
  return true;
}

const rigs = new WeakMap();
export function applyRifleHandPose(THREE, character, side, localTarget) {
  const visual = character?.userData?.curatedCharacterAttachment?.visual;
  if (!visual) return false;
  let bones = rigs.get(visual);
  if (!bones) {
    bones = {};
    visual.traverse(object => { if (object.isBone) bones[object.name.toLowerCase().replace(/[^a-z]/g, '')] = object; });
    rigs.set(visual, bones);
  }
  const target = character.localToWorld(localTarget.clone());
  const pole = character.localToWorld(new THREE.Vector3(side === 'r' ? -.7 : .7, .9, .15));
  return placeHand(THREE, bones[`upperarm${side}`], bones[`lowerarm${side}`], bones[`wrist${side}`], target, pole);
}
