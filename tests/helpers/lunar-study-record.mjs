// Controlled record shapes only, never claimed as source gameplay.
import {
  lunarFieldPlan,
  lunarStudyReportId,
  lunarStudyMissionId,
} from '../../app/js/planetary/lunar-survey.js';
export function lunarReportFixture(
  variantId = 'campaign',
  strategy = variantId === 'alternate-method' ? 'observe' : 'samples',
) {
  return {
    eventId: lunarStudyReportId(variantId),
    sourceSystem: 'destination-missions',
    eventType: 'destination-mission-complete',
    name: 'Controlled lunar study',
    occurredAt: 1000000,
    metadata: {
      missionId: lunarStudyMissionId(variantId),
      ...(variantId !== 'campaign'
        ? { surveyVariantId: variantId, definitionId: 'mission:moon' }
        : {}),
      lunarVersion: 1,
      truthType: 'authored',
      prepared: true,
      strategy,
      fieldEvidence: lunarFieldPlan(strategy).map((e) => e.evidenceId),
      expeditionId: 'fixture-expedition',
      podId: 'fixture-final-pod',
      outcomeId: 'cautious-baseline',
      ...(variantId === 'planned-return'
        ? {
            siteARecovery: {
              podId: 'fixture-site-a-pod',
              expeditionId: 'fixture-expedition',
              atMs: 900000,
            },
          }
        : {}),
    },
  };
}
