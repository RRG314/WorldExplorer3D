// Verification driver: observes the aircraft and uses normal WASD/throttle
// controls. No position or physics state is written after the initial setup.
export async function followFlightOrbit(page, signal, {radius = 750, altitude = 220, speed = 75} = {}) {
  const held = new Set(), samples = [];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const setKey = async (key, down) => {
    if (down === held.has(key)) return;
    if (down) { await page.keyboard.down(key); held.add(key); }
    else { await page.keyboard.up(key); held.delete(key); }
  };
  try {
    while (!signal.stopped) {
      const pose = await page.evaluate(() => {
        const a = globalThis.__WE3D_TRAVEL_ACTOR__;
        return {x:a.x,y:a.y,z:a.z,yaw:a.yaw,pitch:a.pitch,pitchRate:a.pitchRate,roll:a.roll,speed:a.speed,turnRate:a.turnRate,climbRate:a.climbRate,airborne:a.airborne,at:performance.now()};
      });
      const theta = Math.atan2(pose.z, pose.x) + .3;
      const desiredYaw = Math.atan2(radius * Math.cos(theta) - pose.x, radius * Math.sin(theta) - pose.z);
      const headingError = Math.atan2(Math.sin(desiredYaw - pose.yaw), Math.cos(desiredYaw - pose.yaw));
      const turnCommand = headingError - pose.turnRate * .25;
      const desiredClimb = clamp((altitude - pose.y) * .2, -8, 8);
      const desiredPitch = clamp((desiredClimb - pose.climbRate) * .014 + Math.abs(pose.roll) * .035, -.15, .15);
      const pitchCommand = desiredPitch - pose.pitch - pose.pitchRate * .18;
      await setKey('a', turnCommand > .065);
      await setKey('d', turnCommand < -.065);
      await setKey('s', pitchCommand > .045);
      await setKey('w', pitchCommand < -.045);
      await setKey('Space', pose.speed < speed - 4);
      await setKey('Shift', pose.speed > speed + 4);
      samples.push({...pose,headingError,desiredPitch,radius:Math.hypot(pose.x,pose.z)});
      if (!pose.airborne) throw Error('Orbit probe touched ground; flight measurement invalid');
      await new Promise(resolve => setTimeout(resolve,100));
    }
  } finally {
    for (const key of held) await page.keyboard.up(key).catch(()=>{});
  }
  return {samples,scope:'Synthetic keyboard orbit; controls only after initial placement'};
}
