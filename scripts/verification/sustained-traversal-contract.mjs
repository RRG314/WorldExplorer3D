// Keep an interrupted/short route failed while the harness continues collecting
// the independent resource-retention checks. Recovery is never measured travel.
export function sustainedTraversalObserved(mode, sample, interrupted = false, requiredDurationMs = 90000) {
  const minimum = {walk:100,drive:300,plane:1000}[mode];
  return Number.isFinite(minimum) && interrupted === false &&
    Number.isFinite(requiredDurationMs) && requiredDurationMs >= 90000 &&
    Number.isFinite(sample.distanceTraveled) && sample.distanceTraveled >= minimum &&
    Number.isFinite(sample.movingMs) && sample.movingMs >= requiredDurationMs * 2 / 3 &&
    Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= requiredDurationMs;
}

// Pending/cancelled jobs are not evidence that travel replaced accepted detail.
export function streetDetailTurnovers(background = []) {
  let previous = null, count = 0;
  for (const sample of background) {
    const pavement = sample.pavement, focus = pavement?.focus;
    if (!Number.isFinite(focus?.x) || !Number.isFinite(focus?.z)) continue;
    if (!previous) previous = {x:focus.x,z:focus.z};
    if (pavement.active !== false) continue;
    if (focus.x !== previous.x || focus.z !== previous.z) count++;
    previous = {x:focus.x,z:focus.z};
  }
  return count;
}
