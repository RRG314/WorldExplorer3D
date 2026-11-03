import { researchCareerDefinition } from './research-career-definitions.js';
import { lunarStudyReport } from '../planetary/lunar-study-records.js';
export function personalWorkspaceEligible(profile = {}, reports = []) {
  if (
    profile.activeExperience?.schemaVersion === 1 &&
    profile.activeExperience.definitionVersion === 1 &&
    profile.activeExperience.experienceId === 'career:field-engineer'
  )
    return true;
  if (profile.openingChapter?.phase === 'complete') return true;
  if (profile.soloRacer?.schemaVersion === 1 && profile.soloRacer.phase === 'complete') return true;
  for (const [id, state] of Object.entries(profile.researchCareers || {})) {
    try {
      researchCareerDefinition(id);
    } catch {
      continue;
    }
    if (
      state?.schemaVersion === 1 &&
      Object.values(state.completed || {}).some(
        (v) => typeof v === 'string' && v.startsWith('event:research:')
      )
    )
      return true;
  }
  return reports.some((report) => !!lunarStudyReport(report));
}
