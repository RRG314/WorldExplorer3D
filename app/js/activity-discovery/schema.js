function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const DISCOVERY_CATEGORIES = Object.freeze([
  { id: 'all', label: 'All', icon: '◎', color: '#e2e8f0' },
  { id: 'nearby', label: 'Nearby', icon: '◉', color: '#fbbf24' },
  { id: 'featured', label: 'Featured', icon: '★', color: '#f97316' },
  { id: 'creator', label: 'Creator', icon: '✦', color: '#a855f7' },
  { id: 'room', label: 'Rooms', icon: '⌘', color: '#8b5cf6' },
  { id: 'driving', label: 'Driving', icon: '▣', color: '#f97316' },
  { id: 'walking', label: 'Walking', icon: '△', color: '#22c55e' },
  { id: 'rooftop', label: 'Rooftop', icon: '⬒', color: '#ec4899' },
  { id: 'exploration', label: 'Explore', icon: '◇', color: '#06b6d4' },
  { id: 'challenge', label: 'Challenge', icon: '✪', color: '#ef4444' },
  { id: 'boat', label: 'Boat', icon: '⚓', color: '#0ea5e9' },
  { id: 'fishing', label: 'Fishing', icon: '◌', color: '#14b8a6' },
  { id: 'submarine', label: 'Submarine', icon: '◈', color: '#0284c7' },
  { id: 'drone', label: 'Drone', icon: '⬡', color: '#6366f1' }
]);

const TEMPLATE_TO_CATEGORY = Object.freeze({
  driving_route: 'driving',
  walking_route: 'walking',
  collectible_hunt: 'exploration',
  rooftop_run: 'rooftop',
  interior_route: 'exploration',
  boat_course: 'boat',
  fishing_trip: 'fishing',
  submarine_course: 'submarine',
  drone_course: 'drone'
});

function getDiscoveryCategory(categoryId = 'all') {
  const key = sanitizeText(categoryId, 48).toLowerCase();
  return DISCOVERY_CATEGORIES.find((entry) => entry.id === key) || DISCOVERY_CATEGORIES[0];
}

function listDiscoveryCategories() {
  return DISCOVERY_CATEGORIES.slice();
}

function discoveryCategoryForTemplate(templateId = '', traversalMode = '') {
  const templateKey = sanitizeText(templateId, 80).toLowerCase();
  if (TEMPLATE_TO_CATEGORY[templateKey]) return TEMPLATE_TO_CATEGORY[templateKey];
  const traversalKey = sanitizeText(traversalMode, 32).toLowerCase();
  if (traversalKey === 'boat') return 'boat';
  if (traversalKey === 'drone') return 'drone';
  if (traversalKey === 'submarine') return 'submarine';
  if (traversalKey === 'walk') return 'walking';
  return 'driving';
}

function discoveryCategoryForActivity(activity = {}) {
  if (String(activity.sourceType || '').toLowerCase() === 'room') return 'room';
  if (String(activity.sourceType || '').toLowerCase() === 'room_activity') {
    return discoveryCategoryForTemplate(activity.templateId, activity.traversalMode) || 'room';
  }
  if (String(activity.sourceType || '').toLowerCase() === 'creator') {
    return discoveryCategoryForTemplate(activity.templateId, activity.traversalMode) || 'creator';
  }
  const subtype = sanitizeText(activity.subtype || '', 48).toLowerCase();
  if (subtype === 'fishing') return 'fishing';
  if (subtype === 'rooftop') return 'rooftop';
  if (subtype === 'exploration') return 'exploration';
  if (subtype === 'legacy_mode') return 'challenge';
  return discoveryCategoryForTemplate(activity.templateId, activity.traversalMode);
}

function discoveryBadgeForActivity(activity = {}) {
  const sourceType = sanitizeText(activity.sourceType, 32).toLowerCase();
  if (sourceType === 'creator') return 'Creator Activity';
  if (sourceType === 'room_activity') return 'Room Game';
  if (sourceType === 'room') {
    if (activity.visibility === 'private') return 'Private Room';
    if (activity.isWeekly) return 'Featured Room';
    return 'Room Session';
  }
  if (activity.featured) return 'Featured';
  if (activity.isNearby) return 'Nearby';
  return 'World Activity';
}

function discoveryVisibilityLabel(activity = {}) {
  if (sanitizeText(activity.sourceType, 32).toLowerCase() === 'room_activity') return 'Room Shared';
  const visibility = sanitizeText(activity.visibility, 24).toLowerCase();
  if (visibility === 'private') return 'Private';
  if (visibility === 'room') return 'Room';
  return 'Public';
}

function discoveryActionLabel(activity = {}, isReplay = false) {
  if (isReplay) return 'Replay';
  if (String(activity.sourceType || '').toLowerCase() === 'room') return 'Join Room';
  if (String(activity.sourceType || '').toLowerCase() === 'room_activity') return 'Open Room Game';
  return 'Start Activity';
}

function discoveryMarkerShape(activity = {}) {
  const category = discoveryCategoryForActivity(activity);
  if (category === 'room') return 'diamond';
  if (category === 'boat' || category === 'fishing') return 'ring';
  if (category === 'drone') return 'hex';
  if (category === 'rooftop') return 'triangle';
  return 'beacon';
}

function discoveryIconForActivity(activity = {}) {
  const category = getDiscoveryCategory(discoveryCategoryForActivity(activity));
  return category.icon;
}

function discoveryColorForActivity(activity = {}) {
  const category = getDiscoveryCategory(discoveryCategoryForActivity(activity));
  return category.color;
}

export {
  discoveryActionLabel,
  discoveryBadgeForActivity,
  discoveryCategoryForActivity,
  discoveryCategoryForTemplate,
  discoveryColorForActivity,
  discoveryIconForActivity,
  discoveryMarkerShape,
  discoveryVisibilityLabel,
  getDiscoveryCategory,
  listDiscoveryCategories,
  sanitizeText
};
