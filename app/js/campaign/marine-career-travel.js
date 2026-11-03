import { validateOceanVoyage } from '../ocean/voyage-store.js';
import { fieldDistance } from './field-study-contract.js';
const same = (a, b) =>
  a &&
  b &&
  a.id === b.id &&
  a.ship.transportEntityId === b.ship.transportEntityId &&
  a.subId === b.subId;
export function marineCareerResumeVoyage(value, variantId, latest, normalize) {
  const state = normalize(value);
  if (state.schemaVersion !== 1)
    throw Error('This saved ocean career needs a newer version of World Explorer.');
  const unfinished = state.active && state.active.phase !== 'complete';
  if (unfinished && state.active.variantId !== variantId)
    throw Error('Continue the current vessel survey before choosing another.');
  const saved = validateOceanVoyage((unfinished ? state.active : state.records[variantId])?.voyage);
  if (!saved) return null;
  const newer = validateOceanVoyage(latest);
  return same(saved, newer) && newer.savedAt > saved.savedAt ? newer : saved;
}
// Entry coordinates and saved transport identities are different inputs. The
// existing globe admission or voyage resume owner performs the actual travel.
export function createMarineCareerTravel({
  domainId,
  normalize,
  sitesForVariant,
  runtime,
  readProfile,
  travelToOcean,
}) {
  return async ({ intent, isCurrent = () => true }) => {
    const profile = await readProfile();
    if (!isCurrent()) return false;
    const variantId = intent.variantId || 'campaign',
      sites = sitesForVariant(variantId);
    const saved = marineCareerResumeVoyage(
        profile.researchCareers?.[domainId],
        intent.variantId || 'campaign',
        runtime.oceanVoyage?.saved,
        normalize
      ),
      current = validateOceanVoyage(runtime.oceanVoyage?.current),
      active = !!(runtime.boatMode?.active || runtime.oceanMode?.active);
    if (saved && active && same(saved, current)) return true;
    if (
      !saved &&
      active &&
      current?.ship.transportCatalogId === 'ocean-research-vessel' &&
      !runtime.sharedMarine?.active &&
      sites.some((s) => fieldDistance(s, current.site) < 1800)
    )
      return true;
    let result;
    if (saved) {
      if (!runtime.oceanVoyage?.resume) {
        const { ensureOceanVoyage } = await import('../ocean/voyage.js');
        if (!isCurrent()) return false;
        ensureOceanVoyage(runtime);
      }
      result = await runtime.oceanVoyage.resume(saved, { isCurrent });
    } else result = await travelToOcean(intent.place, { isCurrent });
    if (result === false || !isCurrent()) return false;
    const accepted = validateOceanVoyage(runtime.oceanVoyage?.current);
    return (
      !!accepted &&
      accepted.ship.transportCatalogId === 'ocean-research-vessel' &&
      !runtime.sharedMarine?.active &&
      !!(runtime.boatMode?.active || runtime.oceanMode?.active) &&
      (saved ? same(accepted, saved) : sites.some((s) => fieldDistance(s, accepted.site) < 1800))
    );
  };
}
