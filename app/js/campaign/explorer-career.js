import { normalizeOpeningChapter } from './first-bearings.js?v=1';
import {
  harborJourneyState,
  HARBOR_COMPLETE_ID,
  LUNAR_DISPLAY_ID,
  LUNAR_REPORT_ID,
} from './lunar-homecoming.js';
import { coastalDepartureState, coastalEventId } from './coastal-departure.js';
import { investigationState, investigationId } from './coastal-investigation.js';
import { homeAchievementBadges } from './home-achievements.js';
const escape = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export function explorerCareerView(profile = {}, events = []) {
  const opening = normalizeOpeningChapter(profile.openingChapter),
    journey = harborJourneyState(profile, events),
    coast = coastalDepartureState(events),
    investigation = investigationState(events),
    badges = homeAchievementBadges(profile),
    maker = badges.some((b) => b.id === 'useful-place');
  const chapters = [
    {
      id: 'bearings',
      label: 'First Bearings',
      complete: opening.phase === 'complete',
      target: 'opening',
      recordId: opening.eventId,
    },
    {
      id: 'delivery',
      label: 'Harbor Run',
      complete: profile.harborRun?.phase === 'complete',
      target: 'activity:harbor-run',
      recordId: 'event:campaign-completed:harbor-run:v1',
      branch: true,
    },
    {
      id: 'photographs',
      label: 'A Place in Three Views',
      complete: profile.threeViews?.phase === 'complete',
      target: 'career:documentary-explorer',
      recordId: 'event:campaign-completed:three-views:v1',
      branch: true,
    },
    {
      id: 'workspace',
      label: 'Make a Useful Place',
      complete: maker,
      target: 'career:field-engineer',
      recordId: 'event:campaign:useful-place:v1',
      branch: true,
    },
    {
      id: 'home',
      label: 'A Place to Return',
      complete: badges.some((b) => b.id === 'place-to-return'),
      target: 'home',
      recordId: 'event:campaign:place-to-return:v1',
    },
    {
      id: 'coastal',
      label: 'Coastal Departure',
      complete: coast.completed,
      target: 'coast',
      recordId: coastalEventId('launch'),
    },
    {
      id: 'seabed',
      label: 'Read the Seabed',
      complete: !!investigation.chart,
      target: 'coast',
      recordId: investigationId('chart'),
    },
    {
      id: 'dive',
      label: 'Outside the Hull',
      complete: !!investigation.diver,
      target: 'coast',
      recordId: investigationId('return'),
    },
    {
      id: 'coast-report',
      label: 'What the Coast Revealed',
      complete: investigation.completed,
      target: 'coast',
      recordId: investigationId('report'),
    },
    {
      id: 'preparation',
      label: 'Preparing for Another World',
      complete: journey.report?.metadata?.prepared === true,
      target: 'career:planetary-scientist',
      recordId: LUNAR_REPORT_ID,
    },
    {
      id: 'moon',
      label: 'A Different Kind of Shore',
      complete: !!journey.report,
      target: 'career:planetary-scientist',
      recordId: LUNAR_REPORT_ID,
    },
    {
      id: 'return',
      label: 'Bring the Journey Home',
      complete: !!journey.display,
      target: 'home',
      recordId: LUNAR_DISPLAY_ID,
    },
  ];
  const branch = chapters.slice(1, 4).some((c) => c.complete),
    next = !chapters[0].complete
      ? chapters[0]
      : !branch
        ? { id: 'branch', label: 'Choose your local journey', target: 'branches' }
        : chapters.slice(4).find((c) => !c.complete) ||
          (!journey.complete
            ? { id: 'campaign', label: 'Review the journey at your home desk', target: 'home' }
            : null);
  return {
    phase: opening.schemaVersion !== 1 ? 'unavailable' : journey.complete ? 'complete' : 'active',
    chapters,
    next,
    branch,
    completedMilestones:
      Number(chapters[0].complete) +
      Number(branch) +
      chapters.slice(4).filter((c) => c.complete).length,
    totalMilestones: 10,
    decisions: journey.steps,
    completionId: journey.complete ? HARBOR_COMPLETE_ID : null,
    resumeVoyage: investigation.resumeVoyage || coast.resumeVoyage || null,
  };
}
export function explorerCareerSummary(profile, events = []) {
  const v = explorerCareerView(profile, events);
  return {
    title: 'From the Harbor',
    summary:
      v.phase === 'complete'
        ? 'Your local, coastal and lunar journey is saved. Review your decisions or choose another career.'
        : 'Begin with one local discovery, choose a delivery, photo or Maker branch, establish a base, investigate the coast and bring a lunar field book home. Each chapter keeps its own saved result.',
    stages: v.chapters.map((c) => ({
      label: c.label + (c.branch ? ' · choose at least one local branch' : ''),
      complete: c.complete,
    })),
    actionLabel: v.phase === 'complete' ? 'Review saved journey' : 'Open Explorer journey',
  };
}
export function explorerJourneyMarkup(view, openingMarkup = '') {
  const button = (target, label) =>
    `<button type="button" data-explorer-target="${escape(target)}">${escape(label)}</button>`;
  return `<div class="discoveryExplorerJourney"><span class="discoveryChapterEyebrow">EXPLORER JOURNEY</span><strong>From the Harbor${view.phase === 'complete' ? ' · Complete' : ''}</strong><p>Optional · no time limit. Explore freely and return to any unfinished chapter. Complete First Bearings, one local branch and the home, coastal and lunar chapters.</p><p>${view.completedMilestones} of ${view.totalMilestones} milestones saved</p>${openingMarkup}${view.phase === 'unavailable' ? '<p>This saved opening needs a newer version of World Explorer. Your journey is kept.</p>' : view.next && view.next.target !== 'opening' && view.next.target !== 'branches' ? button(view.next.target, view.next.label) : ''}${
    view.next?.target === 'branches'
      ? `<div class="discoveryPhotoActions">${view.chapters
          .filter((c) => c.branch)
          .map((c) => button(c.target, c.label))
          .join('')}</div>`
      : ''
  }<details><summary>All chapters and saved decisions</summary><ol>${view.chapters.map((c) => `<li><strong>${escape(c.label)}</strong> · ${c.complete ? 'Saved' : c.branch ? 'Local branch · choose at least one' : 'Not yet finished'}${c.complete && c.recordId ? button('record:' + c.recordId, 'Review saved record') : ''}</li>`).join('')}</ol><ul>${view.decisions
    .filter((d) => d.complete)
    .map((d) => `<li>${escape(d.label)} · ${escape(d.decision)}</li>`)
    .join(
      ''
    )}</ul></details>${view.phase === 'complete' ? button('record:' + view.completionId, 'Review campaign record') + button('careers', 'Choose your next career') : ''}</div>`;
}
