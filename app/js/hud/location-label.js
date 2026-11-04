// An active vessel keeps its own voyage label while the retained Earth scene
// may still be the city from which the player departed. A saved other vessel
// must never rename the currently controlled world.
export function voyageHudLocation(context) {
  const mode = context.boatMode,
    voyage = context.oceanVoyage?.current,
    site = voyage?.site;
  if (
    !mode?.active ||
    voyage?.stage !== 'aboard' ||
    !mode.transportEntityId ||
    mode.transportEntityId !== voyage.ship?.transportEntityId ||
    !Number.isFinite(site?.lat) ||
    !Number.isFinite(site?.lon)
  )
    return '';
  return String(site.name || site.region || 'Research voyage').trim();
}
