import { explorerProgressSnapshot } from './explorer-events.js?v=3';

const RELEASED_EXPLORER_TOOLS = Object.freeze([
  'field-lens', 'field-camera', 'metal-detector', 'hand-trowel', 'fishing-rod',
  'field-binoculars', 'rock-hammer', 'sediment-pan',
  'fossil-brush', 'specimen-brush', 'field-shovel', 'portable-sonar'
]);

const EXPLORER_TOOL_UNLOCKS = Object.freeze({
  'field-lens': Object.freeze({ points: 0, label: 'Starting field kit' }),
  'field-camera': Object.freeze({ points: 0, label: 'Starting field kit' }),
  'metal-detector': Object.freeze({ points: 0, label: 'Starting field kit' }),
  'hand-trowel': Object.freeze({ points: 0, label: 'Starting field kit' }),
  'fishing-rod': Object.freeze({ points: 0, label: 'Starting field kit' }),
  'field-binoculars': Object.freeze({ points: 8, label: 'Reach Pathfinder' }),
  'rock-hammer': Object.freeze({ points: 8, label: 'Reach Pathfinder' }),
  'sediment-pan': Object.freeze({ points: 8, label: 'Reach Pathfinder' }),
  'fossil-brush': Object.freeze({ points: 20, label: 'Reach Field Explorer' }),
  'specimen-brush': Object.freeze({ points: 20, label: 'Reach Field Explorer' }),
  'field-shovel': Object.freeze({ points: 20, label: 'Reach Field Explorer' }),
  'portable-sonar': Object.freeze({ points: 20, label: 'Reach Field Explorer' })
});

function explorerToolProgress(profile = {}) {
  const progress = explorerProgressSnapshot(profile.explorerProgress);
  const points = progress.points;
  const unlockedToolIds = RELEASED_EXPLORER_TOOLS.filter((toolId) => points >= (EXPLORER_TOOL_UNLOCKS[toolId]?.points || 0));
  const lockedTools = RELEASED_EXPLORER_TOOLS
    .filter((toolId) => !unlockedToolIds.includes(toolId))
    .map((toolId) => ({ toolId, ...EXPLORER_TOOL_UNLOCKS[toolId], pointsRemaining: Math.max(0, EXPLORER_TOOL_UNLOCKS[toolId].points - points) }));
  const nextUnlockPoints = lockedTools.length ? Math.min(...lockedTools.map((entry) => entry.points)) : null;
  return Object.freeze({
    points,
    unlockedToolIds: Object.freeze(unlockedToolIds),
    lockedTools: Object.freeze(lockedTools),
    nextUnlock: nextUnlockPoints == null ? null : Object.freeze({
      points: nextUnlockPoints,
      pointsRemaining: Math.max(0, nextUnlockPoints - points),
      toolIds: Object.freeze(lockedTools.filter((entry) => entry.points === nextUnlockPoints).map((entry) => entry.toolId)),
      label: lockedTools.find((entry) => entry.points === nextUnlockPoints)?.label || 'Next Explorer rank'
    })
  });
}

function guideIdentificationsInRegion(guide = [], regionId = '') {
  const id = String(regionId || '');
  return guide.filter((entry) => Array.isArray(entry.regions) && entry.regions.includes(id)).length;
}

function explorerGoalSnapshot({ profile = {}, guide = [], items = [], events = [], regionId = '', regionLabel = 'Current region' } = {}) {
  const progress = explorerProgressSnapshot(profile.explorerProgress);
  const regionalIdentifications = guideIdentificationsInRegion(guide, regionId);
  const fieldEvents = events.filter((event) => ['discovery-recorded', 'specimen-collected'].includes(event.eventType));
  let goal;
  if (!fieldEvents.length) {
    goal = { id: 'first-discovery', label: 'Make your first discovery', detail: 'Choose a nearby lead and record what you find.', current: 0, target: 1, reward: 'Start your Journal and Field Guide' };
  } else if (!items.length) {
    goal = { id: 'first-collection', label: 'Collect your first specimen', detail: 'Use a collecting activity such as metal detecting in a suitable place.', current: 0, target: 1, reward: 'Learn Discover versus Collect' };
  } else if (regionalIdentifications < 3) {
    goal = { id: 'regional-starter', label: `Survey ${regionLabel}`, detail: 'Identify three different discoveries in this region.', current: regionalIdentifications, target: 3, reward: 'Complete your first regional goal' };
  } else if (progress.points < 8) {
    goal = { id: 'reach-pathfinder', label: 'Reach Pathfinder', detail: 'New identifications and new-region evidence build Explorer rank.', current: progress.points, target: 8, reward: 'Unlock Binoculars, Rock Hammer, and Sediment Pan' };
  } else if (regionalIdentifications < 6) {
    goal = { id: 'regional-pathfinder', label: `Deepen your ${regionLabel} survey`, detail: 'Build a broader wildlife, Earth, and places record here.', current: regionalIdentifications, target: 6, reward: 'Regional Pathfinder recognition' };
  } else if (progress.points < 20) {
    goal = { id: 'reach-field-explorer', label: 'Reach Field Explorer', detail: 'Explore new regions and build more than one specialty.', current: progress.points, target: 20, reward: 'Unlock advanced field tools and Portable Sonar' };
  } else {
    const paths = progress.paths || {};
    if ((paths.activity?.firsts || 0) < 1) {
      goal = { id: 'first-game', label: 'Complete a world activity', detail: 'Choose a game from Games & Activities and finish its route.', current: 0, target: 1, reward: 'Begin your Games path' };
    } else if ((paths.creation?.firsts || 0) < 1) {
      goal = { id: 'first-creation', label: 'Leave your mark on the world', detail: 'Save an Editor feature or reach your first Blocks milestone.', current: 0, target: 1, reward: 'Earn the World Maker badge' };
    } else if ((paths.travel?.records || 0) < 3) {
      goal = { id: 'three-places', label: 'Explore three places', detail: 'Visit two more destinations and build a wider Journal.', current: paths.travel?.records || 0, target: 3, reward: 'Grow your Travel path' };
    } else if (progress.points < 45) {
      goal = { id: 'reach-expeditioner', label: 'Reach Expeditioner', detail: 'Fieldwork, games, making, travel, companions, and community firsts all count.', current: progress.points, target: 45, reward: 'Expeditioner rank' };
    } else {
    const nature = Number(progress.specialties?.nature?.uniqueDiscoveries) || 0;
    const earth = Number(progress.specialties?.earth?.uniqueDiscoveries) || 0;
    const places = Number(progress.specialties?.places?.uniqueDiscoveries) || 0;
    const balanced = Math.min(nature, earth, places);
    goal = { id: 'balanced-explorer', label: 'Build all three Explorer specialties', detail: 'Identify Nature, Earth, and Places discoveries across your travels.', current: Math.min(3, balanced), target: 3, reward: 'Balanced Explorer recognition' };
    }
  }
  return Object.freeze({ ...goal, regionId, regionLabel, complete: goal.current >= goal.target, progressPercent: Math.min(100, Math.round(goal.current / Math.max(1, goal.target) * 100)) });
}

function regionalProgressSnapshot({ guide = [], events = [], regionId = '', regionLabel = 'Current region' } = {}) {
  const regionalGuide = guide.filter((entry) => Array.isArray(entry.regions) && entry.regions.includes(regionId));
  const countFamily = (pattern) => regionalGuide.filter((entry) => pattern.test(String(entry.family || ''))).length;
  const wildlife = countFamily(/wildlife|bird|animal|fish|marine/i);
  const earth = countFamily(/rock|mineral|sediment|fossil|gem|ore|metal/i);
  const places = Math.max(0, regionalGuide.length - wildlife - earth);
  const regionalEvents = events.filter((event) => event.regionId === regionId);
  const categories = Object.freeze([
    Object.freeze({ id: 'nature', label: 'Wildlife & Nature', current: wildlife, target: 3 }),
    Object.freeze({ id: 'earth', label: 'Geology & Fossils', current: earth, target: 3 }),
    Object.freeze({ id: 'places', label: 'Places & Finds', current: places, target: 3 }),
    Object.freeze({ id: 'activities', label: 'Field Activities', current: new Set(regionalEvents.map((event) => event.activityId)).size, target: 4 })
  ]);
  const completed = categories.reduce((sum, category) => sum + Math.min(category.current, category.target), 0);
  const target = categories.reduce((sum, category) => sum + category.target, 0);
  return Object.freeze({ regionId, regionLabel, identifications: regionalGuide.length, journalEvents: regionalEvents.length, categories, completed, target, percent: Math.round(completed / target * 100) });
}

export {
  EXPLORER_TOOL_UNLOCKS,
  RELEASED_EXPLORER_TOOLS,
  explorerGoalSnapshot,
  explorerToolProgress,
  guideIdentificationsInRegion,
  regionalProgressSnapshot
};
