function boundedScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function guidanceLabel(informationTier = 'basic') {
  if (informationTier === 'detailed') return 'Detailed flight guidance';
  if (informationTier === 'guided') return 'Clear flight guidance';
  if (informationTier === 'standard') return 'Flight guidance';
  return 'Basic flight guidance';
}

function spacecraftOperationTuning(capability) {
  const control = boundedScore(capability?.assistance?.control);
  const informationTier = String(capability?.assistance?.informationTier || 'basic');
  return Object.freeze({
    type: 'SpacecraftCharacterTuning',
    manualTurnScale: Number((1 + control * 0.0012).toFixed(4)),
    informationTier,
    guidanceLabel: guidanceLabel(informationTier)
  });
}

export { spacecraftOperationTuning };
