// These two atlases belong to the licensed E34 source. Keep their authored
// glass, lights and trim; never tint the entire vehicle to imitate body paint.
export const PLAYER_CAR_FINISHES = Object.freeze({ white: 'Alpine White', slate: 'Slate' });

export function applyPlayerCarFinish(ctx, finish = 'white') {
  if (!Object.hasOwn(PLAYER_CAR_FINISHES, finish)) return false;
  ctx.playerCarFinish = finish;
  const visual = ctx.carMesh?.userData?.curatedVehicleVisual;
  const map = visual?.userData?.finishMaps?.[finish];
  if (!map) return false; // A late asset load reads the same desired choice.
  visual.traverse(object => {
    if (object.isMesh && object.material?.name === '.001') {
      object.material.map = map;
      object.material.needsUpdate = true;
    }
  });
  visual.userData.paintFinish = `artist-${finish}-exterior`;
  return true;
}
