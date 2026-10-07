// Keep an interrupted/short route failed while the harness continues collecting
// the independent resource-retention checks. Recovery is never measured travel.
export function sustainedTraversalObserved(mode, sample, interrupted = false) {
  const minimum = {walk:100,drive:300,plane:1000}[mode];
  return Number.isFinite(minimum) && interrupted === false &&
    Number.isFinite(sample.distanceTraveled) && sample.distanceTraveled >= minimum &&
    Number.isFinite(sample.movingMs) && sample.movingMs >= 60000 &&
    Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 90000;
}
