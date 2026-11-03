// Verification only. Coordinates are read to steer real held keyboard controls;
// this never writes an actor pose, speed, surface, camera or physics parameter.
export async function createNormalRoadDriver(
  qa,
  {
    read,
    focus,
    avoid = async (target) => ({ target }),
    units = 1.11,
    onCheckpoint = async () => {},
  }
) {
  const { page } = qa,
    held = new Set();
  let pedal = null,
    steering = null;
  async function keys(next) {
    for (const k of [...held])
      if (!next.includes(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    for (const k of next)
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
  }
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  async function stop() {
    await keys([]);
    pedal = null;
    steering = null;
  }
  async function drive(
    points,
    { timeoutMs = 240000, stopAtEnd = true, allowReverseAtStop = false, name = 'drive' } = {}
  ) {
    if (points.length < 2 || points.length > 1000)
      throw Error('Use a bounded existing driving route.');
    await focus();
    const initial = await read(),
      first = points[0],
      goal = points.at(-1),
      heading = Math.atan2(goal.x - initial.car.x, goal.z - initial.car.z),
      pathLength = points
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z) * units, 0),
      reverse =
        allowReverseAtStop &&
        pathLength < 30 &&
        Math.abs(wrap(heading - initial.car.angle)) > 2 &&
        points.every(
          (p) =>
            Math.hypot(p.x - first.x, p.z - first.z) < 1 ||
            Math.abs(wrap(Math.atan2(p.x - first.x, p.z - first.z) - heading)) < 0.5
        );
    let segment = 0,
      lastProgress = Date.now(),
      lastPosition = null,
      lastCheckpoint = Date.now(),
      started = Date.now();
    try {
      while (Date.now() - started < timeoutMs) {
        const s = await read(),
          car = s.car;
        if (s.paused || s.mode !== 'drive')
          throw Error('Normal driving needs an unpaused driving owner.');
        const goal = points.at(-1),
          distance = Math.hypot(goal.x - car.x, goal.z - car.z) * units,
          speed = car.speedMph * 0.44704;
        if (stopAtEnd && distance < 5 && speed < 0.14) {
          await stop();
          return s;
        }
        if (!stopAtEnd && distance < 3) {
          await stop();
          return s;
        }
        let best = null;
        for (let i = segment; i < Math.min(points.length - 1, segment + 10); i++) {
          const a = points[i],
            b = points[i + 1],
            dx = b.x - a.x,
            dz = b.z - a.z,
            t = Math.max(
              0,
              Math.min(1, ((car.x - a.x) * dx + (car.z - a.z) * dz) / (dx * dx + dz * dz || 1))
            ),
            p = { x: a.x + dx * t, z: a.z + dz * t },
            d = Math.hypot(p.x - car.x, p.z - car.z);
          if (!best || d < best.d) best = { i, t, p, d };
        }
        segment = best.i;
        if (best.d * units > 12)
          throw Error(`${name}: left the checked route by ${(best.d * units).toFixed(1)} m`);
        let remaining = Math.max(9, Math.min(18, 9 + speed)) / units,
          target = best.p,
          index = segment;
        while (remaining > 0 && index < points.length - 1) {
          const b = points[index + 1],
            length = Math.hypot(b.x - target.x, b.z - target.z);
          if (length >= remaining) {
            const t = remaining / (length || 1);
            target = { x: target.x + (b.x - target.x) * t, z: target.z + (b.z - target.z) * t };
            remaining = 0;
          } else {
            remaining -= length;
            target = b;
            index++;
          }
        }
        const clearance = await avoid(target);
        target = clearance.target;
        const error = wrap(
            Math.atan2(target.x - car.x, target.z - car.z) - car.angle - (reverse ? Math.PI : 0)
          ),
          abs = Math.abs(error),
          anticipated = error - (Number(car.yawRate) || 0) * 0.22;
        if (
          (steering === 'ArrowLeft' && anticipated * (reverse ? -1 : 1) > 0.015) ||
          (steering === 'ArrowRight' && anticipated * (reverse ? -1 : 1) < -0.015)
        ) {
        } else steering = null;
        if (!steering && Math.abs(anticipated) > 0.055)
          steering = anticipated > 0 !== reverse ? 'ArrowLeft' : 'ArrowRight';
        let desired = abs > 0.65 ? 4 : abs > 0.3 ? 7 : 13;
        if (reverse) desired = Math.min(desired, 3);
        if (clearance.detour) desired = Math.min(desired, 5);
        if (clearance.blocked) desired = 0;
        // See a real upcoming bend early enough to brake, rather than oscillate at
        // every small speed error. Pedals remain held across their hysteresis band.
        for (let i = segment + 1, away = 0; i < Math.min(points.length - 1, segment + 8); i++) {
          const a = points[i - 1],
            b = points[i],
            c = points[i + 1];
          away += Math.hypot(b.x - a.x, b.z - a.z) * units;
          const bend = Math.abs(
            wrap(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z))
          );
          if (bend > 0.45 && away < Math.max(15, (speed * speed) / 5 + 8))
            desired = Math.min(desired, 6);
        }
        if (stopAtEnd && distance < Math.max(6, (speed * speed) / 5 + 3)) desired = 0;
        if (desired === 0 || car.speedMph > desired + 4) pedal = 'Space';
        else if (car.speedMph < desired - (reverse ? 1 : 3))
          pedal = reverse ? 'ArrowDown' : 'ArrowUp';
        else if (pedal === 'Space' && car.speedMph < desired + 1) pedal = null;
        else if (['ArrowUp', 'ArrowDown'].includes(pedal) && car.speedMph > desired + 1)
          pedal = null;
        await keys([pedal, steering].filter(Boolean));
        if (
          !lastPosition ||
          Math.hypot(car.x - lastPosition.x, car.z - lastPosition.z) * units > 0.5
        ) {
          lastProgress = Date.now();
          lastPosition = { x: car.x, z: car.z };
        }
        if (Date.now() - lastProgress > 20000)
          throw Error(`${name}: real driving stalled; preserve the contact and input trace`);
        if (Date.now() - lastCheckpoint > 20000) {
          await onCheckpoint(name + ' · normal held-input progress');
          lastCheckpoint = Date.now();
        }
        await page.waitForTimeout(45);
      }
      throw Error(`${name}: bounded normal drive exceeded ${timeoutMs / 1000} seconds`);
    } finally {
      await stop();
    }
  }
  return { drive, stop, keys };
}
