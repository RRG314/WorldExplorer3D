function boundedScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function guidanceLabel(informationTier = 'basic') {
  if (informationTier === 'detailed') return 'Detailed placement guidance';
  if (informationTier === 'guided') return 'Clear placement guidance';
  if (informationTier === 'standard') return 'Placement guidance';
  return 'Basic placement guidance';
}

function constructionTuning(capability) {
  const control = boundedScore(capability?.assistance?.control);
  const interpretation = boundedScore(capability?.assistance?.interpretation);
  const informationTier = String(capability?.assistance?.informationTier || 'basic');
  return Object.freeze({
    type: 'ConstructionCharacterTuning',
    placementRangeScale: Number((1 + control * 0.001).toFixed(4)),
    mappedSelectionRadiusMeters: Number((42 + interpretation * 0.06).toFixed(1)),
    informationTier,
    guidanceLabel: guidanceLabel(informationTier)
  });
}

export { constructionTuning };
