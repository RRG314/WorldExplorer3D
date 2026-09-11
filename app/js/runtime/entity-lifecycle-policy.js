const ENTITY_LIFECYCLE_MS = Object.freeze({
  lootPickup: 90_000,
  downedActor: 30_000,
  disabledRoadVehicle: 45_000,
  disabledResponder: 30_000,
  disabledTransport: 45_000
});

function lifecycleExpired(startedAt, lifetimeMs, currentTime) {
  const started = Number(startedAt);
  const lifetime = Math.max(0, Number(lifetimeMs) || 0);
  const current = Number(currentTime);
  return Number.isFinite(started) && Number.isFinite(current) && current - started >= lifetime;
}

function markLifecycleStart(entity, key, currentTime) {
  if (!entity || !key) return 0;
  const existing = Number(entity[key]);
  if (Number.isFinite(existing) && existing > 0) return existing;
  const started = Number(currentTime);
  entity[key] = Number.isFinite(started) ? started : 0;
  return entity[key];
}

export { ENTITY_LIFECYCLE_MS, lifecycleExpired, markLifecycleStart };
