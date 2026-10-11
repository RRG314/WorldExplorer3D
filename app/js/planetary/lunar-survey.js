// Authored comparison stations on the existing LROC Apollo 11 surface. These
// are game samples, never coordinates or specimens from the Apollo collection.
export const LUNAR_FIELD_PLAN = Object.freeze([
  { evidenceId: 'mare-context', activityId: 'photograph', label: 'Site A · photograph the mare surface', family: 'places', offset: { x: 30, z: -18 }, description: 'A contextual panorama of the LROC-derived terrain. The nearby game sample represents a basalt analog; the image alone cannot determine its composition.' },
  { evidenceId: 'mare-sample', activityId: 'geology-inspect', label: 'Site A · inspect the basalt analog', family: 'rock', offset: { x: 39, z: -18 }, description: 'A dark, fine-grained game specimen used to investigate a volcanic origin. This is an authored analog, not a recovered Apollo sample.' },
  { evidenceId: 'fragment-context', activityId: 'photograph', label: 'Site B · photograph the fragment field', family: 'places', offset: { x: -90, z: 95 }, description: 'Record the second site before collection. Local rocks are authored dressing on LROC-derived relief, not individually measured lunar objects.' },
  { evidenceId: 'fragment-sample', activityId: 'geology-inspect', label: 'Site B · inspect the breccia analog', family: 'rock', offset: { x: -81, z: 95 }, description: 'A game specimen with fragments in a finer matrix. Compare impact reworking with the basalt analog; appearance alone cannot establish age or exact composition.' }
].map(entry => Object.freeze({ ...entry, offset: Object.freeze(entry.offset) })));

export const LUNAR_SURVEY_SOURCES = Object.freeze([
  'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11',
  'https://ares.jsc.nasa.gov/astromaterials3d/sample-catalog.htm?origin=A11'
]);

export const LUNAR_STRATEGIES = Object.freeze([
  Object.freeze({ id: 'samples', label: 'Return two samples', description: 'Photograph both sites, seal a basalt and a breccia analog, then compare them in the ship lab.' }),
  Object.freeze({ id: 'observe', label: 'Leave the sites untouched', description: 'Photograph both sites and record their grain and fragment structure with the optical scanner. No material enters your Backpack.' })
]);
const observationPlan = Object.freeze(LUNAR_FIELD_PLAN.map(entry => entry.activityId !== 'geology-inspect' ? entry : Object.freeze({
  ...entry, evidenceId: entry.evidenceId.replace('-sample', '-observation'), activityId: 'geology-observe',
  label: entry.evidenceId === 'mare-sample' ? 'Site A · examine the fine-grained analog' : 'Site B · examine the fragment-rich analog',
  description: entry.evidenceId === 'mare-sample'
    ? 'The optical record shows a fine-grained game analog consistent with cooled volcanic material. No sample was removed; composition and age remain unmeasured.'
    : 'The optical record shows fragments in a finer matrix in this authored analog. Impact reworking is a comparison hypothesis; no sample was removed or dated.'
})));
export function lunarFieldPlan(strategy = 'samples') { return strategy === 'observe' ? observationPlan : LUNAR_FIELD_PLAN; }
export function lunarPreparationReady(preparation, expeditionId) {
  return Boolean(preparation?.version === 1 && LUNAR_STRATEGIES.some(entry => entry.id === preparation.strategy)
    && preparation.expeditionId === expeditionId && preparation.returnBriefed === true
    && Number.isFinite(preparation.calibratedAtMs) && preparation.calibratedAtMs > 0);
}
export function atLunarPreparationStation(ctx) {
  const ship = ctx?.getShipInteriorSnapshot?.(), player = ctx?.Walk?.state?.walker;
  return Boolean(ctx?.activeShipInterior && ship?.active && ship.shipId === 'solis-reach' && ship.deckId === 'command'
    && ctx.universeRuntime?.current?.id === 'sol' && !ctx.universeRuntime?.transition && !ctx.paused
    && Number.isFinite(player?.x) && Number.isFinite(player?.z)
    && (ctx.activeInterior?.interactions || []).some(station => (station.id === 'science-survey' || station.stationId === 'science-survey')
      && Math.hypot(player.x-station.x, player.z-station.z) <= Number(station.radius || 2.15)));
}
