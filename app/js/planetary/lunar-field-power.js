// Game instrument power, not spacesuit oxygen or a real EVA endurance model.
// Reserve short blocks before use so a reload cannot refill the current sortie.
export const LUNAR_POWER_SECONDS = 20 * 60;
const RESERVATION_SECONDS = 15;

export function createLunarFieldPower() {
  return Object.freeze({ version: 1, capacityS: LUNAR_POWER_SECONDS, remainingS: LUNAR_POWER_SECONDS });
}
export function validLunarFieldPower(value) {
  return Boolean(value?.version === 1 && value.capacityS === LUNAR_POWER_SECONDS
    && Number.isFinite(value.remainingS) && value.remainingS >= 0 && value.remainingS <= value.capacityS);
}

export function createLunarPowerController({ readJourney, commitJourney, isActive, position, returnPoint }) {
  let identity = null, persistedRemaining = null, credit = 0, failed = false;
  function current() {
    const journey = readJourney();
    if (journey?.bodyId !== 'moon' || journey.contactId !== 'destination-mission:moon' || !validLunarFieldPower(journey.fieldPower)) return null;
    if (identity !== journey.id || persistedRemaining !== journey.fieldPower.remainingS) {
      identity = journey.id; persistedRemaining = journey.fieldPower.remainingS; credit = 0; failed = false;
    }
    return journey;
  }
  function snapshot() {
    const journey = current();
    if (!journey) return null;
    const actor = position(), pod = returnPoint();
    const located = [actor?.x, actor?.z, pod?.x, pod?.z].every(Number.isFinite);
    const distanceM = located ? Math.hypot(actor.x - pod.x, actor.z - pod.z) : null;
    // A deliberately conservative game estimate: 1 m/s, 50% route allowance,
    // and two minutes for recovery. It is not a terrain path or safety claim.
    const reserveS = located ? Math.ceil(distanceM * 1.5 + 120) : LUNAR_POWER_SECONDS;
    const remainingS = Math.max(0, Math.min(LUNAR_POWER_SECONDS, journey.fieldPower.remainingS + credit));
    return Object.freeze({ remainingS, reserveS, distanceM, saveBlocked: failed,
      canSurvey: !failed && located && remainingS > reserveS,
      phase: failed ? 'save-blocked' : remainingS <= 0 ? 'empty' : remainingS <= reserveS ? 'return' : 'survey' });
  }
  function update(dt) {
    const journey = current();
    if (!journey || journey.phase !== 'surface' || !isActive() || failed) return snapshot();
    let elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.25, dt)) : 0;
    if (!elapsed) return snapshot();
    while (elapsed > 0) {
      if (credit <= 0) {
        const available = Math.min(RESERVATION_SECONDS, readJourney().fieldPower.remainingS);
        if (!available) break;
        const next = Object.freeze({ ...readJourney(), fieldPower: Object.freeze({ ...journey.fieldPower,
          remainingS: readJourney().fieldPower.remainingS - available }) });
        try { commitJourney(next); }
        catch { failed = true; break; }
        persistedRemaining = next.fieldPower.remainingS; credit = available;
      }
      const used = Math.min(credit, elapsed); credit -= used; elapsed -= used;
    }
    return snapshot();
  }
  return Object.freeze({ snapshot, update, retry() { current(); failed = false; return update(.001); } });
}
