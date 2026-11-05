// Release presentation is separate from course progress and location admission.
// New career entries default to Coming soon until their complete bounded course
// has acceptance evidence. Do not infer readiness from an adapter existing.
const released = new Set([
  'racer',
  'geologist',
  'archaeologist',
  'mining-engineer',
  'palaeontologist',
  'oceanographer',
  'marine-biologist',
  'wildlife-ecologist',
  'botanist',
  'hydrologist',
  'meteorologist',
  'cartographer',
  'planetary-scientist',
  'astronomer',
  'accelerator-scientist',
  'field-engineer',
  'documentary-explorer',
  'explorer',
  'companion-handler',
]);

export function careerAvailability(id) {
  const slug = String(id || '').replace(/^career:/, '');
  return released.has(slug)
    ? { releaseStatus: 'ready', releaseLabel: 'Ready to play', releaseReason: '' }
    : {
        releaseStatus: 'coming-soon',
        releaseLabel: 'Coming soon',
        releaseReason:
          slug === 'expedition-pilot'
            ? 'The flight career is in development. Harbor Run road deliveries are available in Quick play.'
            : 'This career is still in development. Choose a ready career or explore freely.',
      };
}

export function orderCareerEntries(entries, { explorerFirst = false, focusId = null } = {}) {
  const rank = (entry) =>
    entry.kind === 'career' && entry.releaseStatus !== 'ready'
      ? 3
      : explorerFirst && entry.id === 'career:explorer'
        ? 0
        : entry.id === focusId
          ? 1
          : 2;
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

// A prior pilot selection points at the original saved road job. Opening
// Continue offers that same owner, without claiming a finished aviation career.
export function continuableExperienceId(id) {
  return id === 'career:expedition-pilot' ? 'activity:harbor-run' : id;
}
