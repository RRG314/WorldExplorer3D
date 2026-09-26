// One optional invitation at a time. Gameplay actions and opened panels always
// take precedence. Expired invitations remain in their owning journal/settings.
export function createAmbientNoticeDirector({ now = () => performance.now(), cooldownMs = 30000 } = {}) {
  let active = null, nextAt = 0;
  const seen = new Set();
  function expire() {
    if (active && now() >= active.until) { active = null; }
  }
  function release(owner) {
    if (active?.owner !== owner) return;
    nextAt = now() + cooldownMs;
    active = null;
  }
  function request(owner, key, { durationMs = 7000, blocked = false } = {}) {
    expire();
    if (blocked) { release(owner); return false; }
    const id = `${owner}:${key}`;
    if (active) return active.id === id;
    if (seen.has(id) || now() < nextAt) return false;
    const duration = Number.isFinite(durationMs) ? Math.max(1000, durationMs) : Infinity;
    active = { owner, id, until: now() + duration };
    nextAt = active.until + cooldownMs;
    seen.add(id);
    if (seen.size > 128) seen.delete(seen.values().next().value);
    return true;
  }
  return Object.freeze({ request, release, reset(owner) { release(owner); for (const key of seen) if (key.startsWith(`${owner}:`)) seen.delete(key); nextAt = now(); }, snapshot() { expire(); return active ? { ...active } : null; } });
}
export const ambientNotices = createAmbientNoticeDirector();
