import { CAREER_EXPERIENCES } from './catalog.js';
import { personalCareerAchievements } from '../campaign/career-achievements.js';
import { lunarCampaignBadges } from '../campaign/lunar-homecoming.js';
import { investigationBadges } from '../campaign/coastal-investigation.js';
import { lunarStudyState } from '../planetary/lunar-study-records.js';

export function presentCareerSummary(entry, profile, summary, { variantId = 'campaign' } = {}) {
  const state = profile?.researchCareers?.[entry?.adapterId],
    receipt = state?.completed?.[variantId];
  // A follow-on study replaces `active`, but never erases its earlier saved
  // assignment. An actively replayed study continues to show its current steps.
  if (
    state?.schemaVersion === 1 &&
    typeof receipt === 'string' &&
    receipt.startsWith('event:research:') &&
    !summary?.resume
  )
    return {
      ...summary,
      stages: summary?.stages?.map((stage) => ({ ...stage, complete: true })),
      actionLabel: summary?.actionLabel || 'Review saved assignment',
    };
  return summary;
}

// Read-only portfolio. Availability and curriculum stay in the existing catalog
// and adapters; completions stay in the domain's validated saved state.
export function projectCareerPortfolio({ profile = {}, summaryFor, context = {} }) {
  const careers = CAREER_EXPERIENCES.filter((row) => row.releaseStatus === 'ready').map((entry) => {
    let summary;
    try {
      summary = summaryFor(entry, profile, context);
    } catch {
      return {
        id: entry.id,
        label: entry.label,
        unavailable: true,
        stages: [],
        choices: [],
        completedStudies: 0,
        next: 'Your saved assignment needs attention. Open it to review recovery.',
      };
    }
    const stages = summary?.stages || [],
      done = stages.filter((row) => row.complete).length;
    const state = profile.researchCareers?.[entry.adapterId];
    const completedStudies =
      entry.adapterId === 'planetary'
        ? Object.values(lunarStudyState(context.planetaryView?.events || []).reports).filter(
            Boolean
          ).length
        : new Set(
            Object.values(state?.schemaVersion === 1 ? state.completed || {} : {}).filter(
              (value) => typeof value === 'string' && value.startsWith('event:research:')
            )
          ).size;
    return {
      id: entry.id,
      label: entry.label,
      title: summary?.title || entry.assignment,
      summary: summary?.summary || entry.summary,
      stages,
      choices: summary?.choices || [],
      completedStudies,
      done,
      total: stages.length,
      resume: !!summary?.resume,
      next:
        stages.find((row) => !row.complete)?.label ||
        (summary?.choices?.length > 1
          ? 'Choose a follow-on assignment or review your saved work.'
          : 'Open this pursuit to continue its saved journey.'),
      assignmentComplete: stages.length > 0 && done === stages.length,
      following: profile.journeyPreferences?.activeFocusId === entry.id,
    };
  });
  return {
    careers,
    achievements: [
      ...personalCareerAchievements(profile),
      ...lunarCampaignBadges(profile, context.journeyEvents || []),
      ...investigationBadges(context.journeyEvents || []),
    ],
    following: profile.journeyPreferences?.activeFocusId || null,
    name: profile.journeyPreferences?.explorerName || 'Explorer',
  };
}
