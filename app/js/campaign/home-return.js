import { isEarthWorldUsable } from '../earth-core/world-readiness.js';
export function homeWorldOrigin(home) {
  if (home?.worldOrigin && [home.worldOrigin.lat, home.worldOrigin.lon].every(Number.isFinite))
    return { ...home.worldOrigin };
  const saved = home?.workspace?.projects?.worldOrigin;
  if (saved && [saved.lat, saved.lon].every(Number.isFinite)) return { ...saved };
  const match = home?.locationId?.match(/:([-\d.]+):([-\d.]+)$/);
  return match ? { lat: Number(match[1]), lon: Number(match[2]), name: home.locationLabel } : null;
}
// Navigation/spawn and housing keep their existing authorities. This command
// grants no deed, health, money, equipment or competitive result.
export function createHomeReturn({ runtime, getHousing, travelToPlace, resolveEntrance }) {
  let pending = null;
  async function arrive(home, { owned = true } = {}) {
    const owner = runtime.getAccountUserId?.() || '',
      origin = homeWorldOrigin(home);
    if (!origin)
      throw Error(
        'This older home has no saved region. Open its original region and set a route from Properties.'
      );
    if (runtime.worldLoading || runtime.titleLaunchPending)
      throw Error('Wait for your current journey to finish loading.');
    if (
      owned &&
      !getHousing()
        .snapshot()
        .homes.some((row) => row.id === home.id)
    )
      throw Error('This home is no longer owned.');
    runtime.stopLiveGpsMode?.({ reason: 'home-return' });
    runtime.stopGameplayPlugin?.('home-return', { resumeFree: false });
    runtime.clearActiveInterior?.({ restorePlayer: true, preserveCache: true });
    if (runtime.activeInterior) throw Error('Leave this interior before returning home.');
    if ((await travelToPlace({ ...origin, id: 'home-region', environment: 'earth' })) === false)
      throw Error('Your home region could not load. Your home and belongings are kept.');
    if ((runtime.getAccountUserId?.() || '') !== owner)
      throw Error('Your account changed. Reopen Your journey before travelling.');
    if (!isEarthWorldUsable(runtime))
      throw Error('Your home region is still preparing. Try again when it is ready.');
    if (
      owned &&
      !getHousing()
        .snapshot()
        .homes.some((row) => row.id === home.id)
    )
      throw Error('This home is no longer owned.');
    const entrance = resolveEntrance(home);
    if (!entrance?.support?.enterable)
      throw Error(
        'The mapped entrance is unavailable. Your home is kept; choose a nearby safe point from the map.'
      );
    const placed = runtime.restoreSurfaceTravelPose?.(
      'walk',
      { x: entrance.x, z: entrance.z },
      { source: owned ? 'personal-home-return' : 'personal-home-visit', emitTutorial: false }
    );
    if (!placed)
      throw Error('A safe arrival could not be found. Your current place and belongings are kept.');
    if (owned) {
      if (!(await runtime.enterInteriorForSupport?.(entrance.support)))
        throw Error(
          'You arrived at your home entrance, but its interior could not open. Try the door again.'
        );
      if (
        (runtime.getAccountUserId?.() || '') !== owner ||
        !getHousing()
          .snapshot()
          .homes.some((row) => row.id === home.id)
      ) {
        runtime.clearActiveInterior?.({ restorePlayer: true, preserveCache: true });
        throw Error(
          'Your account or home ownership changed. Reopen Your journey before travelling.'
        );
      }
    }
    runtime.stopGameplayPlugin?.('home-arrival', { resumeFree: true });
    return { homeId: home.id, returned: owned, sheltered: owned };
  }
  function run(home, options) {
    if (pending) return pending;
    const work = arrive(home, options);
    pending = work;
    return work.finally(() => {
      if (pending === work) pending = null;
    });
  }
  return Object.freeze({
    returnHome: (home) => run(home),
    visit: (home) => run(home, { owned: false }),
    busy: () => !!pending,
  });
}
