import { normalizeThreeViews } from './three-views.js';
import { documentaryStory, DOCUMENTARY_STORY } from './documentary-story.js';
export const DOCUMENTARY_ASSIGNMENTS = Object.freeze({
  campaign: { id: 'campaign', label: 'A Place in Three Views' },
  'field-story': { id: 'field-story', label: DOCUMENTARY_STORY.label },
});
export function documentarySummary(base, variantId = 'campaign') {
  const story = documentaryStory(base),
    editing = variantId === 'field-story',
    done = editing ? story.phase === 'complete' : base.phase === 'complete',
    photo = base.phase === 'complete' && base.mode === 'photo' && !base.mediaDeleted;
  if (base.schemaVersion !== 1 || story.schemaVersion !== 1)
    return {
      title: 'Update required',
      summary: 'Your saved photographs are kept. This record needs a newer version.',
      choices: [],
      stages: [],
    };
  return {
    title: DOCUMENTARY_ASSIGNMENTS[variantId]?.label || 'A Place in Three Views',
    summary: editing
      ? 'Turn your original three photographs into an ordered, captioned field story with a clear question and conclusion.'
      : 'Choose a visible mapped building, photograph contrasting street, detail and setting views, then save the album.',
    resume: editing
      ? ['select', 'edit', 'review'].includes(story.phase)
      : ['choose', 'framing', 'review'].includes(base.phase),
    actionLabel: done ? 'Review saved record' : undefined,
    choices: Object.values(DOCUMENTARY_ASSIGNMENTS).filter(
      (r) => r.id === 'campaign' || photo || story.phase !== 'available'
    ),
    stages: (editing
      ? [
          ['State a visual question and title', story.phase !== 'available'],
          ['Select and order the original photographs', !!story.source],
          [
            'Write and save three evidence-based captions',
            !!story.captions && Object.values(story.captions).every((t) => t.length >= 8),
          ],
          ['Review the images and conclusion', ['review', 'complete'].includes(story.phase)],
          ['Save and export your finished field story', done],
        ]
      : [
          ['Choose the photo or observation job', base.phase !== 'available'],
          ['Select a visible mapped building', !!base.subject],
          ['Keep three contrasting viewpoints', base.views?.length === 3],
          ['Review and save the album', done],
          ['Open the saved album or edit a field story', done],
        ]
    ).map(([label, complete]) => ({ label, complete: !!complete })),
  };
}
export function bindDocumentaryCareer(runtime, experiences) {
  return experiences.registerAdapter('documentary', {
    equipment:
      'Photograph a building on foot with the in-game camera. Capture its street frontage, a facade detail and the wider setting, then arrange your photographs into a captioned field story.',
    places: ({ profile, variantId } = {}) => {
      const base = normalizeThreeViews(profile?.threeViews),
        editing =
          variantId === 'field-story' && runtime.gameStarted && runtime.getEnv?.() === 'EARTH',
        p = editing
          ? runtime.LOC
          : base.locationSnapshot ||
            base.views?.find((v) => v.kind === 'context')?.position ||
            base.subject?.position;
      return [
        {
          id: 'documentary-place',
          name: editing
            ? runtime.LOC?.name || base.regionLabel || 'Current place'
            : base.locationSnapshot?.name || base.regionLabel || 'Baltimore · street photography',
          environment: 'earth',
          lat: p?.lat ?? 39.2904,
          lon: p?.lon ?? -76.6122,
        },
      ];
    },
    summary: ({ profile, variantId }) =>
      documentarySummary(normalizeThreeViews(profile?.threeViews), variantId),
    offer: ({ profile, variantId, place }) => {
      const base = normalizeThreeViews(profile?.threeViews),
        s = documentaryStory(base),
        story = variantId === 'field-story';
      if (base.schemaVersion !== 1 || s.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'Your saved album is kept. This story needs a newer version.',
          enabled: false,
        };
      if (
        story &&
        (base.phase !== 'complete' ||
          base.mode !== 'photo' ||
          (base.mediaDeleted && s.phase !== 'complete'))
      )
        return {
          state: 'temporarily-unavailable',
          label: 'Photographs needed',
          reason:
            'Complete the three-view photo album, or restore its backup if its photographs were deleted.',
          enabled: false,
        };
      if (!story && (runtime.activeInterior || runtime.getLiveGpsSnapshot?.().active))
        return {
          state: 'temporarily-unavailable',
          label: runtime.activeInterior ? 'Go outside first' : 'Turn off Live GPS',
          reason:
            'Take the three views outdoors on foot, with Live GPS off. Your saved album is kept.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Open documentary assignment' : 'Choose a place',
        reason: story
          ? 'Edit your original in-game photographs and save one finished field story.'
          : 'Photograph a mapped place or continue your saved three-view album.',
        enabled: !!place,
      };
    },
    start: ({ intent, isCurrent }) =>
      isCurrent() && Object.hasOwn(DOCUMENTARY_ASSIGNMENTS, intent.variantId)
        ? runtime.startGameplayPlugin?.('research-career', { intent })
        : false,
  });
}
export async function createDocumentaryCareerRuntime({ runtime, intent, isActive, onNext }) {
  const owner = runtime.worldDiscoveryRuntime?.threeViews;
  if (!owner || !isActive())
    throw Error('The album is still preparing. Reopen Activities to continue.');
  const options = { variantId: intent.variantId, isActive, onNext };
  try {
    if (!(await owner.startCareer(options)))
      throw Error('The album could not open. Your saved photographs are kept.');
  } catch (error) {
    owner.stopCareer(options);
    throw error;
  }
  return {
    update() {},
    snapshot: () => owner.snapshot(),
    dispose() {
      owner.stopCareer(options);
    },
  };
}
