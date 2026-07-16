export function createFlowerLeaderboardView(deps = {}) {
  const {
    challengeState,
    getLeaderboardStorageKey,
    getSortLeaderboardEntries,
    leaderboardLimit,
    normalizeChallengeType,
    safeText,
    sanitizePlayerName,
    ui
  } = deps;

function normalizeLeaderboardEntry(raw, forcedChallengeType = null) {
  if (!raw || typeof raw !== 'object') return null;
  const challenge = normalizeChallengeType(forcedChallengeType || raw.challenge || raw.challengeType);
  const player = sanitizePlayerName(raw.player || raw.displayName || raw.name || 'Explorer');
  const location = String(raw.location || 'Unknown Location').slice(0, 80);
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const mode = String(raw.mode || 'driving').slice(0, 24);
  const foundAtSource = raw.foundAt || raw.createdAtIso || raw.lastActiveAt || new Date();
  const foundAtDate = typeof foundAtSource?.toDate === 'function' ? foundAtSource.toDate() : new Date(foundAtSource);
  const foundAt = Number.isFinite(foundAtDate.getTime()) ? foundAtDate.toISOString() : new Date().toISOString();
  const timeMs = Number(raw.timeMs);
  const paintedPct = Number(raw.paintedPct);
  const paintedBuildings = Number(raw.paintedBuildings);
  const totalBuildings = Number(raw.totalBuildings);
  const score = Number(raw.score);
  const weightKg = Number(raw.weightKg);
  const lengthCm = Number(raw.lengthCm);
  const strength = Number(raw.strength);
  const fightTimeMs = Number(raw.fightTimeMs);
  const species = String(raw.species || '').slice(0, 80);
  const speciesId = String(raw.speciesId || '').slice(0, 48);
  const rarity = String(raw.rarity || '').slice(0, 24);
  const behavior = String(raw.behavior || '').slice(0, 32);
  const waterKind = String(raw.waterKind || '').slice(0, 24);
  const lineIntegrityPct = Number(raw.lineIntegrityPct);
  const maxTensionPct = Number(raw.maxTensionPct);
  const roomsJoined = Number(raw.roomsJoined);
  const artifactsShared = Number(raw.artifactsShared);
  const friendsAdded = Number(raw.friendsAdded);

  if (challenge === 'flower') {
    if (!Number.isFinite(timeMs) || timeMs <= 0) return null;
  } else if (challenge === 'painttown') {
    const hasCount = Number.isFinite(paintedBuildings) && paintedBuildings >= 0;
    const hasPct = Number.isFinite(paintedPct) && paintedPct >= 0;
    if (!hasCount && !hasPct) return null;
  } else if (!Number.isFinite(score) || score < 0) {
    return null;
  }

  return {
    id: String(raw.id || raw.docId || `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
    challenge,
    player,
    timeMs: Number.isFinite(timeMs) && timeMs > 0 ? timeMs : null,
    paintedPct: Number.isFinite(paintedPct) ? Math.max(0, Math.min(100, paintedPct)) : null,
    paintedBuildings: Number.isFinite(paintedBuildings) ? Math.max(0, Math.round(paintedBuildings)) : 0,
    totalBuildings: Number.isFinite(totalBuildings) ? Math.max(0, Math.round(totalBuildings)) : 0,
    score: Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0,
    weightKg: Number.isFinite(weightKg) ? Math.max(0, weightKg) : null,
    lengthCm: Number.isFinite(lengthCm) ? Math.max(0, lengthCm) : null,
    strength: Number.isFinite(strength) ? Math.max(0, strength) : null,
    fightTimeMs: Number.isFinite(fightTimeMs) ? Math.max(0, Math.round(fightTimeMs)) : null,
    species,
    speciesId,
    rarity,
    behavior,
    waterKind,
    lineIntegrityPct: Number.isFinite(lineIntegrityPct) ? Math.max(0, Math.min(100, lineIntegrityPct)) : null,
    maxTensionPct: Number.isFinite(maxTensionPct) ? Math.max(0, Math.min(100, maxTensionPct)) : null,
    roomsJoined: Number.isFinite(roomsJoined) ? Math.max(0, Math.round(roomsJoined)) : 0,
    artifactsShared: Number.isFinite(artifactsShared) ? Math.max(0, Math.round(artifactsShared)) : 0,
    friendsAdded: Number.isFinite(friendsAdded) ? Math.max(0, Math.round(friendsAdded)) : 0,
    location,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    mode,
    foundAt
  };
}

function readLocalLeaderboard(challengeType = 'flower') {
  const normalizedType = normalizeChallengeType(challengeType);
  try {
    const raw = localStorage.getItem(getLeaderboardStorageKey(normalizedType));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return getSortLeaderboardEntries()(
      parsed.map((entry) => normalizeLeaderboardEntry(entry, normalizedType)).filter(Boolean),
      normalizedType
    ).slice(0, leaderboardLimit);
  } catch (_) {
    return [];
  }
}

function writeLocalLeaderboard(challengeType, entries) {
  const normalizedType = normalizeChallengeType(challengeType);
  try {
    localStorage.setItem(
      getLeaderboardStorageKey(normalizedType),
      JSON.stringify(getSortLeaderboardEntries()(entries, normalizedType).slice(0, leaderboardLimit))
    );
    return true;
  } catch (_) {
    return false;
  }
}

function renderLeaderboard(entries) {
  if (!ui.titleList) return;
  const challengeType = normalizeChallengeType(challengeState.leaderboardView);

  if (!entries || entries.length === 0) {
    const empty = {
      flower: 'No flower runs yet. Be the first.',
      painttown: 'No paint runs yet. Reach rooftops to paint and post a score.',
      fishing: 'No catches yet. Launch a boat, stop in open water, and cast.',
      explorer: 'Explorer scores appear as people join rooms, share artifacts, and make connections.'
    }[challengeType];
    ui.titleList.innerHTML = `<li class="flowerLeaderboardEmpty">${safeText(empty)}</li>`;
    return;
  }

  ui.titleList.innerHTML = entries.map((entry, idx) => {
    let metric = `${((Number(entry.timeMs) || 0) / 1000).toFixed(2)}s`;
    let locationLine = safeText(entry.location);
    if (challengeType === 'painttown') {
      metric = `${Math.max(0, Math.round(Number(entry.paintedBuildings) || 0))} bldgs`;
      locationLine = `${safeText(entry.location)} | ${safeText((entry.paintedBuildings || 0) + '/' + (entry.totalBuildings || 0))}`;
    } else if (challengeType === 'fishing') {
      metric = `${Math.max(0, Number(entry.score) || 0)} pts`;
      locationLine = `${safeText(entry.species || 'Fish')} | ${Number(entry.weightKg || 0).toFixed(2)} kg | ${Number(entry.lengthCm || 0).toFixed(1)} cm | ${safeText(entry.location)}`;
    } else if (challengeType === 'explorer') {
      metric = `${Math.max(0, Number(entry.score) || 0)} pts`;
      locationLine = `Rooms ${entry.roomsJoined || 0} | Artifacts ${entry.artifactsShared || 0} | Friends ${entry.friendsAdded || 0}`;
    }
    return `<li class="flowerLeaderboardItem">
      <span class="flowerLeaderboardRank">#${idx + 1}</span>
      <span class="flowerLeaderboardPlayer">${safeText(entry.player)}</span>
      <span class="flowerLeaderboardTime">${safeText(metric)}</span>
      <span class="flowerLeaderboardLoc">${locationLine}</span>
    </li>`;
  }).join('');
}


  return { normalizeLeaderboardEntry, readLocalLeaderboard, renderLeaderboard, writeLocalLeaderboard };
}
