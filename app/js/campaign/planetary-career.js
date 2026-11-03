import { LUNAR_STUDIES, lunarFieldPlan, lunarStudyMissionId } from '../planetary/lunar-survey.js';
import { lunarStudyState } from '../planetary/lunar-study-records.js';
// A view of existing mission/Journal results, not another progress authority.
export function planetaryCareerSummary(view, { variantId = 'campaign' } = {}) {
  const id = Object.hasOwn(LUNAR_STUDIES, variantId) ? variantId : 'campaign',
    study = LUNAR_STUDIES[id],
    saved = lunarStudyState(view?.events || []),
    mission = view?.ledger?.missions?.[lunarStudyMissionId(id)],
    unfinished = Object.values(view?.ledger?.missions || {}).find(
      (s) => s.destinationId === 'moon' && !['available', 'complete'].includes(s.phase),
    ),
    plan = lunarFieldPlan(mission?.preparation?.strategy),
    evidence = mission?.evidence || [],
    report = saved.reports[id],
    display = saved.displays[id];
  const pendingHome = Object.keys(LUNAR_STUDIES).find(
    (id) => saved.reports[id] && !saved.displays[id],
  );
  const onMoon =
    view?.environment === 'MOON' &&
    view.ledger?.missions?.[view.ledger.activeMissionId]?.destinationId === 'moon'
      ? view.ledger.activeMissionId
      : null;
  const locked =
    onMoon || unfinished?.missionId || (pendingHome ? lunarStudyMissionId(pendingHome) : null);
  const complete = [
    !!report || !!mission?.preparation,
    !!report ||
      plan
        .filter((e) => e.evidenceId.startsWith('mare-'))
        .every((e) => evidence.includes(e.evidenceId)),
    !!report ||
      plan
        .filter((e) => e.evidenceId.startsWith('fragment-'))
        .every((e) => evidence.includes(e.evidenceId)),
    !!report,
    !!display,
  ];
  return {
    title: study.label,
    summary: study.description,
    resume: !!mission && !['available', 'complete'].includes(mission.phase),
    ...(onMoon
      ? { actionLabel: 'Continue to your pod' }
      : display
        ? { actionLabel: 'Visit the ship' }
        : report
          ? { actionLabel: 'Review the return to Earth' }
          : {}),
    choices: view?.ready
      ? Object.entries(LUNAR_STUDIES)
          .filter(([choice]) =>
            locked
              ? lunarStudyMissionId(choice) === locked
              : choice === 'campaign' || !!saved.displays.campaign,
          )
          .map(([choice, row]) => ({ id: choice, label: row.label }))
      : [],
    stages: [
      'Prepare the two-site plan and return reserve aboard Solis Reach',
      'Observe Site A and record the chosen method',
      'Compare Site B with the same method',
      'Recover to the ship and analyze against orbital context',
      'Return to Earth and review the field book at your desk',
    ].map((label, i) => ({ label, complete: complete[i] })),
  };
}
