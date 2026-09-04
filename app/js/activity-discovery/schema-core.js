function sanitizeText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

const ACTIVITY_TEMPLATE_GROUPS = Object.freeze([
  { id: 'ground', label: 'Street / Ground' },
  { id: 'vertical', label: 'Vertical / Indoor' },
  { id: 'water', label: 'Water' },
  { id: 'air', label: 'Air' }
]);

const ACTIVITY_ANCHOR_TYPES = Object.freeze([
  {
    id: 'start',
    label: 'Start Point',
    icon: '🟢',
    color: '#22c55e',
    description: 'Where the activity begins. Test mode spawns the player or vehicle here.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    transform: { translate: true, height: true, rotate: true, scale: false }
  },
  {
    id: 'checkpoint',
    label: 'Checkpoint',
    icon: '⭕',
    color: '#38bdf8',
    description: 'Ordered route gate or checkpoint marker. These connect into the route path.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    transform: { translate: true, height: true, rotate: true, scale: false }
  },
  {
    id: 'finish',
    label: 'Finish',
    icon: '🏁',
    color: '#f97316',
    description: 'The activity end point or finish line.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    transform: { translate: true, height: true, rotate: true, scale: false }
  },
  {
    id: 'trigger_zone',
    label: 'Trigger Zone',
    icon: '🧊',
    color: '#a855f7',
    description: 'A box trigger volume for start gates, challenge zones, or scripted interactions.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    defaultSize: { x: 14, y: 6, z: 14 },
    transform: { translate: true, height: true, rotate: true, scale: true }
  },
  {
    id: 'obstacle_barrier',
    label: 'Barrier',
    icon: '🚧',
    color: '#f97316',
    description: 'A visible blocking prop for slalom lanes, detours, rooftop runs, or event staging.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    defaultSize: { x: 3.6, y: 1.2, z: 0.6 },
    transform: { translate: true, height: true, rotate: true, scale: false }
  },
  {
    id: 'hazard_zone',
    label: 'Hazard Zone',
    icon: '⚠️',
    color: '#ef4444',
    description: 'A warning volume for fail space, unsafe water, traffic conflict, or penalty zones.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    defaultSize: { x: 16, y: 6, z: 16 },
    transform: { translate: true, height: true, rotate: true, scale: true }
  },
  {
    id: 'boost_ring',
    label: 'Boost Ring',
    icon: '🌀',
    color: '#8b5cf6',
    description: 'A fast visual gate for drone, rooftop, or driving challenge moments.',
    placementMode: 'template_default',
    defaultHeightOffset: 0,
    defaultRadius: 6,
    transform: { translate: true, height: true, rotate: true, scale: true }
  },
  {
    id: 'collectible',
    label: 'Collectible',
    icon: '💠',
    color: '#facc15',
    description: 'A pickup marker for hunt or collection activities.',
    placementMode: 'template_default',
    defaultHeightOffset: 0.2,
    transform: { translate: true, height: true, rotate: false, scale: false }
  },
  {
    id: 'fishing_zone',
    label: 'Fishing Zone',
    icon: '🎣',
    color: '#06b6d4',
    description: 'A water-aligned activity zone for fishing or harbor interactions.',
    placementMode: 'water_surface',
    defaultHeightOffset: 0,
    defaultRadius: 18,
    transform: { translate: true, height: false, rotate: false, scale: true }
  },
  {
    id: 'buoy_gate',
    label: 'Buoy Gate',
    icon: '🛟',
    color: '#38bdf8',
    description: 'A water-surface gate for boat routes, harbor slalom runs, and marina challenge markers.',
    placementMode: 'water_surface',
    defaultHeightOffset: 0,
    defaultRadius: 10,
    transform: { translate: true, height: false, rotate: true, scale: true }
  },
  {
    id: 'dock_point',
    label: 'Dock Point',
    icon: '⚓',
    color: '#eab308',
    description: 'A shoreline or dock-side attachment point for boat-focused activities.',
    placementMode: 'dock',
    defaultHeightOffset: 0,
    transform: { translate: true, height: true, rotate: true, scale: false }
  }
]);

const ACTIVITY_TEMPLATES = Object.freeze([
  {
    id: 'driving_route',
    label: 'Street Race',
    category: 'ground',
    traversalMode: 'drive',
    preferredSurface: 'road',
    description: 'A simple street-based driving game with a clear start, route, and finish.',
    help: [
      'Use this for city races, checkpoint runs, and timed road challenges.',
      'Start, checkpoints, and finish prefer road centerlines so the course stays easy to follow.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'boost_ring', 'obstacle_barrier', 'hazard_zone', 'trigger_zone', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'walking_route',
    label: 'City Walk',
    category: 'ground',
    traversalMode: 'walk',
    preferredSurface: 'walk',
    description: 'An easy on-foot route for tours, scavenger games, and local exploration.',
    help: [
      'Use this for walking tours, exploration, and short ground-based minigames.',
      'Anchors prefer sidewalks, paths, plazas, and other walkable surfaces.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'obstacle_barrier', 'hazard_zone', 'trigger_zone', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'rooftop_run',
    label: 'Roof Run',
    category: 'vertical',
    traversalMode: 'walk',
    preferredSurface: 'rooftop',
    description: 'A parkour-style route across roofs, decks, and elevated ledges.',
    help: [
      'Use this for parkour challenges and elevated traversal routes.',
      'Placement requires elevated surfaces so anchors do not fall to the street below.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'boost_ring', 'obstacle_barrier', 'hazard_zone', 'trigger_zone', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'interior_route',
    label: 'Indoor Run',
    category: 'vertical',
    traversalMode: 'walk',
    preferredSurface: 'interior',
    description: 'An interior route for corridors, floors, and indoor checkpoints.',
    help: [
      'Use this for indoor scavenger hunts, level runs, and lobby routes.',
      'Placement uses currently loaded interior floors and level-aware walk space.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'obstacle_barrier', 'hazard_zone', 'trigger_zone', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'boat_course',
    label: 'Boat Run',
    category: 'water',
    traversalMode: 'boat',
    preferredSurface: 'water_surface',
    description: 'A boat route built for harbors, marinas, coastlines, and open water.',
    help: [
      'Use this for harbor races, marina laps, or open-water checkpoint runs.',
      'Water anchors snap to the surface when possible so the route stays readable.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'buoy_gate', 'fishing_zone', 'dock_point', 'hazard_zone', 'trigger_zone'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'fishing_trip',
    label: 'Fishing Trip',
    category: 'water',
    traversalMode: 'boat',
    preferredSurface: 'water_surface',
    description: 'A dock-to-zone fishing game with a clear casting area and return point.',
    help: [
      'Use this for marina fishing, harbor casting spots, or calm-water challenges.',
      'Add a dock start, a visible fishing zone, and a dock point or finish to return to.'
    ],
    allowedAnchorTypes: ['start', 'fishing_zone', 'dock_point', 'finish', 'buoy_gate', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'fishing_zone', label: 'Fishing Zone', min: 1, max: 4 },
      { id: 'dock_point', label: 'Dock Point', min: 1, max: 2 }
    ]
  },
  {
    id: 'submarine_course',
    label: 'Dive Run',
    category: 'water',
    traversalMode: 'submarine',
    preferredSurface: 'underwater',
    description: 'An underwater route with depth control, hidden pickups, and submerged checkpoints.',
    help: [
      'Use this for reef runs, dive tours, or underwater collection routes.',
      'Anchors stay below the water surface and can be pushed deeper with height editing.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'hazard_zone', 'collectible', 'trigger_zone'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'drone_course',
    label: 'Drone Run',
    category: 'air',
    traversalMode: 'drone',
    preferredSurface: 'air',
    description: 'A free-3D aerial run for flying gates, slalom courses, and skyline routes.',
    help: [
      'Use this for drone slalom runs, aerial tours, and height-based challenges.',
      'Anchors allow vertical placement above terrain, rooftops, or water.'
    ],
    allowedAnchorTypes: ['start', 'checkpoint', 'finish', 'boost_ring', 'hazard_zone', 'trigger_zone', 'collectible'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'checkpoint', label: 'Checkpoint', min: 1, max: 24 },
      { id: 'finish', label: 'Finish', min: 1, max: 1 }
    ]
  },
  {
    id: 'collectible_hunt',
    label: 'Treasure Hunt',
    category: 'ground',
    traversalMode: 'walk',
    preferredSurface: 'walk',
    description: 'A collectible-based scavenger game for streets, rooftops, or interior spaces.',
    help: [
      'Use this for pickup hunts, local exploration games, or collectible chains.',
      'Collectibles can sit on terrain, walk surfaces, rooftops, or interiors depending on where you place them.'
    ],
    allowedAnchorTypes: ['start', 'collectible', 'finish', 'obstacle_barrier', 'hazard_zone', 'trigger_zone'],
    requiredAnchors: [
      { id: 'start', label: 'Start', min: 1, max: 1 },
      { id: 'collectible', label: 'Collectible', min: 1, max: 64 }
    ]
  }
]);

function getActivityTemplate(templateId) {
  const key = sanitizeText(templateId, 80).toLowerCase();
  return ACTIVITY_TEMPLATES.find((entry) => entry.id === key) || ACTIVITY_TEMPLATES[0];
}

function listActivityTemplates() {
  return ACTIVITY_TEMPLATES.slice();
}

function listActivityTemplateGroups() {
  return ACTIVITY_TEMPLATE_GROUPS.map((group) => ({
    ...group,
    templates: ACTIVITY_TEMPLATES.filter((entry) => entry.category === group.id)
  }));
}

function getActivityAnchorType(anchorTypeId) {
  const key = sanitizeText(anchorTypeId, 80).toLowerCase();
  return ACTIVITY_ANCHOR_TYPES.find((entry) => entry.id === key) || ACTIVITY_ANCHOR_TYPES[0];
}

function listActivityAnchorTypes() {
  return ACTIVITY_ANCHOR_TYPES.slice();
}

function listAnchorTypesForTemplate(templateId) {
  const template = getActivityTemplate(templateId);
  return template.allowedAnchorTypes.map((anchorTypeId) => getActivityAnchorType(anchorTypeId));
}

function defaultTemplateForTraversalMode(mode = '') {
  const key = sanitizeText(mode, 32).toLowerCase();
  return ACTIVITY_TEMPLATES.find((entry) => entry.traversalMode === key) || ACTIVITY_TEMPLATES[0];
}

function defaultAnchorTypeForTemplate(templateId) {
  const template = getActivityTemplate(templateId);
  return getActivityAnchorType(template.allowedAnchorTypes[0] || 'start');
}

function orderedRouteAnchors(anchors = []) {
  const start = anchors.find((entry) => entry.typeId === 'start') || null;
  const checkpoints = anchors.filter((entry) => entry.typeId === 'checkpoint');
  const fishingZones = anchors.filter((entry) => entry.typeId === 'fishing_zone');
  const finish = anchors.find((entry) => entry.typeId === 'finish') || null;
  const dockPoint = anchors.find((entry) => entry.typeId === 'dock_point') || null;
  if (checkpoints.length > 0) {
    return [start, ...checkpoints, finish].filter(Boolean);
  }
  return [start, ...fishingZones, finish || dockPoint].filter(Boolean);
}

function countAnchorsByType(anchors = []) {
  const counts = Object.create(null);
  anchors.forEach((anchor) => {
    const key = sanitizeText(anchor?.typeId || '', 80).toLowerCase();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function buildTemplateChecklist(templateId, anchors = []) {
  const template = getActivityTemplate(templateId);
  const counts = countAnchorsByType(anchors);
  return template.requiredAnchors.map((entry) => {
    const count = Number(counts[entry.id] || 0);
    const satisfied = count >= entry.min && (!Number.isFinite(entry.max) || count <= entry.max);
    return {
      id: entry.id,
      label: entry.label,
      count,
      min: entry.min,
      max: entry.max,
      satisfied
    };
  });
}

function createDefaultAnchorDraft(anchorTypeId, options = {}) {
  const anchorType = getActivityAnchorType(anchorTypeId);
  return {
    id: sanitizeText(options.id || `anchor_${Date.now().toString(36)}`, 80).toLowerCase(),
    typeId: anchorType.id,
    label: sanitizeText(options.label || anchorType.label, 80),
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    z: Number(options.z) || 0,
    baseY: Number(options.baseY) || 0,
    heightOffset: Number.isFinite(Number(options.heightOffset)) ? Number(options.heightOffset) : Number(anchorType.defaultHeightOffset || 0),
    yaw: Number(options.yaw) || 0,
    radius: Number.isFinite(Number(options.radius)) ? Number(options.radius) : Number(anchorType.defaultRadius || 8),
    sizeX: Number.isFinite(Number(options.sizeX)) ? Number(options.sizeX) : Number(anchorType.defaultSize?.x || 12),
    sizeY: Number.isFinite(Number(options.sizeY)) ? Number(options.sizeY) : Number(anchorType.defaultSize?.y || 6),
    sizeZ: Number.isFinite(Number(options.sizeZ)) ? Number(options.sizeZ) : Number(anchorType.defaultSize?.z || 12),
    environment: sanitizeText(options.environment || '', 48).toLowerCase(),
    valid: options.valid !== false,
    invalidReason: sanitizeText(options.invalidReason || '', 140),
    support: cloneJson(options.support || null)
  };
}

function buildActivitySummary(activity = {}) {
  const template = getActivityTemplate(activity.templateId);
  const counts = countAnchorsByType(activity.anchors || []);
  const readableCounts = Object.entries(counts)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${value} ${getActivityAnchorType(key).label.toLowerCase()}`)
    .join(', ');
  return {
    title: sanitizeText(activity.name || template.label, 120),
    description: readableCounts || 'No anchors placed yet.',
    traversalMode: template.traversalMode,
    preferredSurface: template.preferredSurface
  };
}

export {
  ACTIVITY_ANCHOR_TYPES,
  ACTIVITY_TEMPLATE_GROUPS,
  ACTIVITY_TEMPLATES,
  buildActivitySummary,
  buildTemplateChecklist,
  countAnchorsByType,
  createDefaultAnchorDraft,
  defaultAnchorTypeForTemplate,
  defaultTemplateForTraversalMode,
  getActivityAnchorType,
  getActivityTemplate,
  listActivityAnchorTypes,
  listActivityTemplateGroups,
  listActivityTemplates,
  listAnchorTypesForTemplate,
  orderedRouteAnchors,
  sanitizeText
};
