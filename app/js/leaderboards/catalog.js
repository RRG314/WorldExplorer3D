const LEADERBOARD_CATALOG = Object.freeze({
  flower: Object.freeze({
    id: 'flower',
    icon: '🌹',
    label: 'Flower Sprint',
    scope: 'Global • All time',
    objective: 'Fastest finish time ranks first.',
    empty: 'No flower runs yet. Finish a Flower Sprint to set the first time.'
  }),
  painttown: Object.freeze({
    id: 'painttown',
    icon: '🟥',
    label: 'Paint Town',
    scope: 'Global • All time',
    objective: 'Paint the most buildings during the two-minute round.',
    empty: 'No Paint Town results yet. Finish a two-minute rooftop round to post a score.'
  }),
  fishing: Object.freeze({
    id: 'fishing',
    icon: '🎣',
    label: 'Fishing',
    scope: 'Global • All time',
    objective: 'Earn points from species rarity, size, strength, and line control.',
    empty: 'No catches yet. Land a fish from a boat or mapped shore to post a score.'
  }),
  explorer: Object.freeze({
    id: 'explorer',
    icon: '🧭',
    label: 'Explorer League',
    scope: 'Global • All time',
    objective: 'Build your community score through rooms, shared artifacts, and friends.',
    empty: 'No Explorer League activity yet. Join a room or share an artifact to begin.'
  }),
  deflock: Object.freeze({
    id: 'deflock',
    icon: '📷',
    label: 'DeFlock Hunt',
    scope: 'Global • All time',
    objective: 'Complete mapped virtual-camera hunts with the highest score and fastest time.',
    empty: 'No completed DeFlock hunts yet. Finish every mapped objective to post a score.'
  })
});

function normalizeLeaderboardId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.hasOwn(LEADERBOARD_CATALOG, normalized) ? normalized : 'flower';
}

function getLeaderboardDefinition(value) {
  return LEADERBOARD_CATALOG[normalizeLeaderboardId(value)];
}

export { LEADERBOARD_CATALOG, getLeaderboardDefinition, normalizeLeaderboardId };
