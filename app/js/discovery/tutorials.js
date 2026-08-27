const SPECIAL_STEPS = Object.freeze({
  'metal-detector': Object.freeze([
    'Move slowly across the virtual area.',
    'The signal grows stronger as you approach a deterministic buried target.',
    'Refine the signal, then excavate with the tool that matches its depth.'
  ]),
  'field-camera': Object.freeze([
    'Choose a plausible subject or clue in the current habitat.',
    'Observe from a respectful virtual distance.',
    'Record the sighting in your Journal and Field Guide; a photograph is not an owned Backpack item.'
  ]),
  'field-binoculars': Object.freeze([
    'Look for tracks and other habitat-plausible clues.',
    'Follow the clue without implying an animal is at a real coordinate.',
    'Record the field lead in your Journal and Field Guide.'
  ]),
  'sediment-pan': Object.freeze([
    'Use this only where the world classifies a river or stream edge.',
    'Wash the virtual sediment to reveal a plausible sample.',
    'Record the virtual sample; no real collecting or access is implied.'
  ])
});

function tutorialForActivity(activityId, catalogs) {
  const activity = catalogs?.activities?.find((entry) => entry.id === String(activityId));
  const tool = catalogs?.tools?.find((entry) => entry.capabilities.includes(activity?.toolCapability));
  if (!activity || !tool) return null;
  const steps = SPECIAL_STEPS[tool.id] || Object.freeze([
    `Use ${tool.label} only in a context where ${activity.label.toLowerCase()} is available.`,
    'Complete the short virtual observation or survey.',
    'Record the result in your Journal and Field Guide. The Backpack is updated only when an object is actually acquired.'
  ]);
  return Object.freeze({ id: tool.tutorialId, toolId: tool.id, title: tool.label, steps });
}

export { tutorialForActivity };
