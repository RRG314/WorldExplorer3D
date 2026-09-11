const RETICLE_PROFILES = Object.freeze({
  pulse: Object.freeze({ baseGap: 8, movementBloom: 5, recoilBloom: 8, recoveryMs: 190 }),
  laser: Object.freeze({ baseGap: 6, movementBloom: 3, recoilBloom: 5, recoveryMs: 135 }),
  paintball: Object.freeze({ baseGap: 11, movementBloom: 7, recoilBloom: 10, recoveryMs: 240 })
});

function reticlePresentation({ kind = 'pulse', speedMph = 0, firedAgoMs = Infinity, hitAgoMs = Infinity } = {}) {
  const profile = RETICLE_PROFILES[kind] || RETICLE_PROFILES.pulse;
  const movement = Math.max(0, Math.min(1, Number(speedMph) / 12));
  const recoil = Math.max(0, 1 - Math.max(0, Number(firedAgoMs)) / profile.recoveryMs);
  return Object.freeze({
    gapPx: Number((profile.baseGap + movement * profile.movementBloom + recoil * profile.recoilBloom).toFixed(2)),
    hitConfirmed: Number(hitAgoMs) >= 0 && Number(hitAgoMs) <= 155,
    recoilActive: recoil > .02,
    profile: kind in RETICLE_PROFILES ? kind : 'pulse'
  });
}

export { RETICLE_PROFILES, reticlePresentation };
