function boundedScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function cueLabel(informationTier = 'basic') {
  if (informationTier === 'detailed') return 'Detailed behavior cues';
  if (informationTier === 'guided') return 'Clear behavior cues';
  if (informationTier === 'standard') return 'Behavior cues';
  return 'Subtle behavior cues';
}

function wildlifeObservationTuning(capability) {
  const interpretation = boundedScore(capability?.assistance?.interpretation);
  const informationTier = String(capability?.assistance?.informationTier || 'basic');
  return Object.freeze({
    type: 'WildlifeObservationTuning',
    observationRadiusMeters: Number((12 + interpretation * 0.035).toFixed(2)),
    informationTier,
    cueLabel: cueLabel(informationTier)
  });
}

function companionHandlingTuning(capability) {
  const control = boundedScore(capability?.assistance?.control);
  const interpretation = boundedScore(capability?.assistance?.interpretation);
  const informationTier = String(capability?.assistance?.informationTier || 'basic');
  return Object.freeze({
    type: 'CompanionHandlingTuning',
    trustRadiusMeters: Number((5.2 + interpretation * 0.013).toFixed(2)),
    calmWaitMs: Math.max(2400, Math.round(3000 - control * 6)),
    informationTier,
    cueLabel: cueLabel(informationTier)
  });
}

export { companionHandlingTuning, wildlifeObservationTuning };
