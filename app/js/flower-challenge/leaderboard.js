function createFlowerChallengeLeaderboardApi(context) {
  const {
    FIREBASE_CONFIG_KEY,
    FIREBASE_STORE_MODULE,
    LEADERBOARD_LIMIT,
    appCtx,
    challengeState,
    constants,
    getFirebaseServices,
    getSignedInUser,
    getActiveActorPosition,
    getRuntimeLocationLabel,
    inferTravelMode,
    normalizeChallengeType,
    normalizeLeaderboardEntry,
    readLocalLeaderboard,
    renderLeaderboard,
    resolvePlayerName,
    setTitleStatus,
    ui,
    writeLocalLeaderboard
  } = context;

  const {
    FIREBASE_COLLECTION,
    FIREBASE_EXPLORER_COLLECTION,
    FIREBASE_FISHING_COLLECTION,
    FIREBASE_PAINT_COLLECTION,
    LOCAL_LEADERBOARD_KEY,
    LOCAL_EXPLORER_LEADERBOARD_KEY,
    LOCAL_FISHING_LEADERBOARD_KEY,
    LOCAL_PAINT_LEADERBOARD_KEY
  } = constants;

  function getLeaderboardStorageKey(challengeType) {
    const type = normalizeChallengeType(challengeType);
    if (type === 'painttown') return LOCAL_PAINT_LEADERBOARD_KEY;
    if (type === 'fishing') return LOCAL_FISHING_LEADERBOARD_KEY;
    if (type === 'explorer') return LOCAL_EXPLORER_LEADERBOARD_KEY;
    return LOCAL_LEADERBOARD_KEY;
  }

  function getLeaderboardCollection(challengeType) {
    const type = normalizeChallengeType(challengeType);
    if (type === 'painttown') return FIREBASE_PAINT_COLLECTION;
    if (type === 'fishing') return FIREBASE_FISHING_COLLECTION;
    if (type === 'explorer') return FIREBASE_EXPLORER_COLLECTION;
    return FIREBASE_COLLECTION;
  }

  function readFirebaseConfig() {
    const fromWindow = globalThis.WORLD_EXPLORER_FIREBASE && typeof globalThis.WORLD_EXPLORER_FIREBASE === 'object' ?
      globalThis.WORLD_EXPLORER_FIREBASE :
      null;

    let fromStorage = null;
    try {
      const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') fromStorage = parsed;
      }
    } catch (_) {
      fromStorage = null;
    }

    const cfg = fromWindow || fromStorage;
    if (!cfg || typeof cfg !== 'object') return null;

    const normalized = {
      apiKey: String(cfg.apiKey || ''),
      authDomain: String(cfg.authDomain || ''),
      projectId: String(cfg.projectId || ''),
      storageBucket: String(cfg.storageBucket || ''),
      messagingSenderId: String(cfg.messagingSenderId || ''),
      appId: String(cfg.appId || '')
    };

    if (!normalized.apiKey || !normalized.projectId || !normalized.appId) return null;
    return normalized;
  }

  function canUseRemoteLeaderboard() {
    return !!readFirebaseConfig();
  }

  function resetFirebaseInitState() {
    challengeState.firebaseInitPromise = null;
    challengeState.firebaseReady = false;
    challengeState.firebase = null;
    challengeState.leaderboardBackend = 'local';
  }

  async function ensureFirebase() {
    if (!canUseRemoteLeaderboard()) {
      resetFirebaseInitState();
      return false;
    }
    if (challengeState.firebaseInitPromise) return challengeState.firebaseInitPromise;

    challengeState.firebaseInitPromise = (async () => {
      const cfg = readFirebaseConfig();
      if (!cfg) {
        challengeState.firebaseReady = false;
        challengeState.firebase = null;
        challengeState.leaderboardBackend = 'local';
        return false;
      }

      try {
        const services = typeof getFirebaseServices === 'function' ? await getFirebaseServices() : null;
        if (!services?.db) throw new Error('Firebase services are unavailable.');
        const firestoreMod = await import(FIREBASE_STORE_MODULE);
        const db = services.db;

        challengeState.firebaseReady = true;
        challengeState.firebase = { db, firestoreMod };
        challengeState.leaderboardBackend = 'firebase';
        return true;
      } catch (err) {
        console.warn('[flower-challenge] Firebase unavailable, using local leaderboard fallback.', err);
        challengeState.firebaseReady = false;
        challengeState.firebase = null;
        challengeState.leaderboardBackend = 'local';
        return false;
      }
    })();

    return challengeState.firebaseInitPromise;
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('we3d-entitlements-changed', () => {
      resetFirebaseInitState();
      refreshFlowerLeaderboard(challengeState.leaderboardView);
    });
  }

  function compareLeaderboardEntries(a, b, challengeType = 'flower') {
    const normalizedType = normalizeChallengeType(challengeType);
    if (normalizedType === 'painttown') {
      const countDelta = (Number(b.paintedBuildings) || 0) - (Number(a.paintedBuildings) || 0);
      if (countDelta !== 0) return countDelta;
      const pctDelta = (Number(b.paintedPct) || 0) - (Number(a.paintedPct) || 0);
      if (Math.abs(pctDelta) > 0.0001) return pctDelta;
      return String(b.foundAt || '').localeCompare(String(a.foundAt || ''));
    }
    if (normalizedType === 'fishing' || normalizedType === 'explorer') {
      const scoreDelta = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDelta !== 0) return scoreDelta;
      if (normalizedType === 'fishing') {
        const weightDelta = (Number(b.weightKg) || 0) - (Number(a.weightKg) || 0);
        if (Math.abs(weightDelta) > 0.0001) return weightDelta;
      }
      return String(b.foundAt || '').localeCompare(String(a.foundAt || ''));
    }
    return (Number(a.timeMs) || Infinity) - (Number(b.timeMs) || Infinity);
  }

  function sortLeaderboardEntries(entries, challengeType = 'flower') {
    const normalizedType = normalizeChallengeType(challengeType);
    return entries.slice().sort((a, b) => compareLeaderboardEntries(a, b, normalizedType));
  }

  async function readRemoteLeaderboard(challengeType = 'flower') {
    const normalizedType = normalizeChallengeType(challengeType);
    const ready = await ensureFirebase();
    if (!ready || !challengeState.firebase) return null;

    try {
      const { db, firestoreMod } = challengeState.firebase;
      const leaderboardRef = firestoreMod.collection(db, getLeaderboardCollection(normalizedType));
      const orderField = normalizedType === 'flower' ? 'timeMs' : normalizedType === 'painttown' ? 'paintedBuildings' : 'score';
      const orderDirection = normalizedType === 'flower' ? 'asc' : 'desc';
      const q = firestoreMod.query(
        leaderboardRef,
        firestoreMod.orderBy(orderField, orderDirection),
        firestoreMod.limit(LEADERBOARD_LIMIT)
      );

      return (await firestoreMod.getDocs(q)).docs
        .map((doc) => normalizeLeaderboardEntry({ ...doc.data(), id: doc.id }, normalizedType))
        .filter(Boolean)
        .sort((a, b) => compareLeaderboardEntries(a, b, normalizedType))
        .slice(0, LEADERBOARD_LIMIT);
    } catch (err) {
      console.warn('[flower-challenge] Failed to read remote leaderboard, falling back to local.', err);
      challengeState.leaderboardBackend = 'local';
      return null;
    }
  }

  async function writeRemoteLeaderboard(challengeType, entry) {
    const normalizedType = normalizeChallengeType(challengeType);
    const ready = await ensureFirebase();
    if (!ready || !challengeState.firebase) return false;

    try {
      const user = typeof getSignedInUser === 'function' ? getSignedInUser() : null;
      if (!user?.uid || normalizedType === 'explorer') return false;
      const { db, firestoreMod } = challengeState.firebase;
      const payload = {
        uid: user.uid,
        challenge: normalizedType,
        player: entry.player,
        timeMs: entry.timeMs,
        paintedPct: entry.paintedPct,
        paintedBuildings: entry.paintedBuildings,
        totalBuildings: entry.totalBuildings,
        location: entry.location,
        lat: entry.lat,
        lon: entry.lon,
        mode: entry.mode,
        createdAtIso: entry.foundAt,
        createdAt: firestoreMod.serverTimestamp()
      };
      if (normalizedType === 'fishing') {
        Object.assign(payload, {
          species: entry.species,
          speciesId: entry.speciesId,
          score: entry.score,
          weightKg: entry.weightKg,
          lengthCm: entry.lengthCm,
          strength: entry.strength,
          rarity: entry.rarity,
          behavior: entry.behavior,
          fightTimeMs: entry.fightTimeMs,
          lineIntegrityPct: entry.lineIntegrityPct,
          maxTensionPct: entry.maxTensionPct,
          waterKind: entry.waterKind
        });
      }
      await firestoreMod.addDoc(firestoreMod.collection(db, getLeaderboardCollection(normalizedType)), payload);
      challengeState.leaderboardBackend = 'firebase';
      return true;
    } catch (err) {
      console.warn('[flower-challenge] Failed to write remote leaderboard, storing locally.', err);
      challengeState.leaderboardBackend = 'local';
      return false;
    }
  }

  async function refreshFlowerLeaderboard(
    challengeType = challengeState.leaderboardView || 'flower',
    options = {}
  ) {
    const normalizedType = normalizeChallengeType(challengeType);
    challengeState.leaderboardView = normalizedType;
    if (ui.titleFlowerTabBtn) ui.titleFlowerTabBtn.classList.toggle('active', normalizedType === 'flower');
    if (ui.titlePaintTabBtn) ui.titlePaintTabBtn.classList.toggle('active', normalizedType === 'painttown');
    if (ui.titleFishingTabBtn) ui.titleFishingTabBtn.classList.toggle('active', normalizedType === 'fishing');
    if (ui.titleExplorerTabBtn) ui.titleExplorerTabBtn.classList.toggle('active', normalizedType === 'explorer');
    if (ui.titleStartBtn) {
      const flowerView = normalizedType === 'flower';
      ui.titleStartBtn.style.display = flowerView ? '' : 'none';
      ui.titleStartBtn.disabled = !flowerView;
    }
    const useRemote = options.remote !== false;
    const entries = (useRemote ? await readRemoteLeaderboard(normalizedType) : null) ||
      readLocalLeaderboard(normalizedType);
    if (!useRemote) challengeState.leaderboardBackend = 'local';
    renderLeaderboard(entries);

    if (ui.titleHint) {
      ui.titleHint.textContent = {
        flower: 'Fastest red-flower runs. Signed-in scores publish to the shared board.',
        painttown: 'Most buildings painted during the two-minute rooftop challenge.',
        fishing: 'Best catches ranked by species rarity, size, strength, and line control.',
        explorer: 'Community score from joining rooms, sharing artifacts, and making connections.'
      }[normalizedType];
    }
    if (ui.status) {
      const prefix = {
        flower: 'Flower leaderboard', painttown: 'Paint leaderboard',
        fishing: 'Fishing leaderboard', explorer: 'Explorer leaderboard'
      }[normalizedType];
      ui.status.dataset.backend = challengeState.leaderboardBackend === 'firebase'
        ? `${prefix}: Firebase live`
        : `${prefix}: Local fallback`;
    }

    return entries;
  }

  function storeLocalResult(challengeType, entry) {
    const normalizedType = normalizeChallengeType(challengeType);
    const current = readLocalLeaderboard(normalizedType);
    current.push(entry);
    writeLocalLeaderboard(
      normalizedType,
      sortLeaderboardEntries(current, normalizedType).slice(0, LEADERBOARD_LIMIT)
    );
  }

  function worldToLatLon(x, z) {
    const baseLat = Number(appCtx.LOC?.lat);
    const baseLon = Number(appCtx.LOC?.lon);
    const scale = Number(appCtx.SCALE || 100000);
    const cosLat = Math.cos((baseLat || 0) * Math.PI / 180) || 1;

    return {
      lat: Number((baseLat - z / scale).toFixed(6)),
      lon: Number((baseLon + x / (scale * cosLat)).toFixed(6))
    };
  }

  function capturePaintTownEntry(payload = {}) {
    const player = resolvePlayerName();
    const loc = getRuntimeLocationLabel();
    const actor = getActiveActorPosition() || { x: appCtx.car?.x || 0, z: appCtx.car?.z || 0 };
    const ll = worldToLatLon(actor.x || 0, actor.z || 0);
    const paintedPct = Number(payload.paintedPct);
    const paintedBuildings = Number(payload.paintedBuildings);
    const totalBuildings = Number(payload.totalBuildings);
    const durationMs = Number(payload.durationMs);

    return normalizeLeaderboardEntry({
      id: `paint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      challenge: 'painttown',
      player,
      paintedPct: Number.isFinite(paintedPct) ? paintedPct : 0,
      paintedBuildings: Number.isFinite(paintedBuildings) ? paintedBuildings : 0,
      totalBuildings: Number.isFinite(totalBuildings) ? totalBuildings : 0,
      timeMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 120000,
      location: loc,
      lat: ll.lat,
      lon: ll.lon,
      mode: String(payload.mode || inferTravelMode()),
      foundAt: new Date().toISOString()
    }, 'painttown');
  }

  async function submitPaintTownScore(payload = {}) {
    const entry = capturePaintTownEntry(payload);
    if (!entry) return null;

    if (!(await writeRemoteLeaderboard('painttown', entry))) {
      storeLocalResult('painttown', entry);
    }
    await refreshFlowerLeaderboard(challengeState.leaderboardView);
    setTitleStatus(`${entry.player} painted ${entry.paintedBuildings || 0} buildings in 2:00 at ${entry.location}.`, 'ok');
    return entry;
  }

  async function submitFishingScore(payload = {}) {
    const entry = normalizeLeaderboardEntry({
      ...payload,
      id: String(payload.id || `fish_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
      challenge: 'fishing',
      player: resolvePlayerName(),
      location: payload.location || getRuntimeLocationLabel(),
      mode: 'boat',
      foundAt: payload.caughtAt || new Date().toISOString()
    }, 'fishing');
    if (!entry) return null;

    if (!(await writeRemoteLeaderboard('fishing', entry))) {
      storeLocalResult('fishing', entry);
    }
    if (challengeState.leaderboardView === 'fishing') await refreshFlowerLeaderboard('fishing');
    setTitleStatus(`${entry.player} landed ${entry.species} for ${entry.score} points at ${entry.location}.`, 'ok');
    return entry;
  }

  function setChallengeLeaderboardView(challengeType = 'flower') {
    challengeState.leaderboardView = normalizeChallengeType(challengeType);
    return refreshFlowerLeaderboard(challengeState.leaderboardView);
  }

  return {
    canUseRemoteLeaderboard,
    compareLeaderboardEntries,
    getLeaderboardCollection,
    getLeaderboardStorageKey,
    readFirebaseConfig,
    refreshFlowerLeaderboard,
    resetFirebaseInitState,
    setChallengeLeaderboardView,
    sortLeaderboardEntries,
    storeLocalResult,
    submitFishingScore,
    submitPaintTownScore,
    writeRemoteLeaderboard
  };
}

export { createFlowerChallengeLeaderboardApi };
