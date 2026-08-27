import { getLeaderboardDefinition } from '../leaderboards/catalog.js?v=1';

export function createFlowerLeaderboardView(deps = {}) {
  const {
    challengeState,
    getSignedInUser,
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
  const disabledCameras = Number(raw.disabledCameras);
  const totalCameras = Number(raw.totalCameras);
  const detections = Number(raw.detections);
  const distance = Number(raw.distance);
  const source = raw.source === 'cloud' ? 'cloud' : 'device';
  const uid = String(raw.uid || '').slice(0, 128);

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
    uid,
    source,
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
    disabledCameras: Number.isFinite(disabledCameras) ? Math.max(0, Math.round(disabledCameras)) : 0,
    totalCameras: Number.isFinite(totalCameras) ? Math.max(0, Math.round(totalCameras)) : 0,
    detections: Number.isFinite(detections) ? Math.max(0, Math.round(detections)) : 0,
    distance: Number.isFinite(distance) ? Math.max(0, distance) : 0,
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
  const definition = getLeaderboardDefinition(challengeType);
  const signedInUid = String(getSignedInUser?.()?.uid || '');

  if (!entries || entries.length === 0) {
    ui.titleList.innerHTML = `<li class="flowerLeaderboardEmpty"><strong>No results yet</strong><span>${safeText(definition.empty)}</span></li>`;
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
    } else if (challengeType === 'deflock') {
      metric = `${Math.max(0, Number(entry.score) || 0)} pts`;
      locationLine = `${entry.disabledCameras || 0}/${entry.totalCameras || 0} virtual cameras | ${((Number(entry.timeMs) || 0) / 1000).toFixed(1)}s | ${safeText(entry.location)}`;
    }
    const isCurrentPlayer = !!signedInUid && entry.uid === signedInUid;
    const sourceLabel = entry.source === 'device' ? '<span class="flowerLeaderboardSource">This device</span>' : '';
    return `<li class="flowerLeaderboardItem${isCurrentPlayer ? ' current-player' : ''}">
      <span class="flowerLeaderboardRank">#${idx + 1}</span>
      <span class="flowerLeaderboardPlayer">${safeText(entry.player)}${isCurrentPlayer ? ' <em>You</em>' : ''}</span>
      <span class="flowerLeaderboardTime">${safeText(metric)}</span>
      <span class="flowerLeaderboardLoc">${locationLine}${sourceLabel}</span>
    </li>`;
  }).join('');
}


  return { normalizeLeaderboardEntry, readLocalLeaderboard, renderLeaderboard, writeLocalLeaderboard };
}
