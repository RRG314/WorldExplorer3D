import { ctx as appCtx } from "../../shared-context.js?v=55";
import { PAINT_TOWN_DEFAULT_COLOR } from "./constants.js?v=1";
import {
  ensurePaintTownState,
  fmtTime,
  getPaintTownActorState,
  getPaintTownPlayerUid,
  getPreferredPaintTownColor,
  normalizePaintColorHex,
  normalizePaintDurationSec,
  normalizePaintTownRules,
  paintColorNameFromHex,
  preferredPaintTownTool,
  setPaintTownActiveTool,
  updatePaintTownHud
} from "./core.js?v=1";
import {
  applyRemotePaintTownClaims,
  buildPaintTownBuildingIndex,
  findPaintableRoofBuilding,
  paintBuildingFromClaim,
  recomputePaintTownCounters,
  restorePaintTownMesh
} from "./claims.js?v=1";
import {
  clearPaintballs,
  clearPaintSplats,
  ensurePaintTownInputBindings,
  firePaintball,
  updatePaintballProjectiles
} from "./projectiles.js?v=1";

function showPaintTownSummary(title, stats) {
  if (typeof appCtx.showResult === "function") {
    appCtx.showResult(title, stats);
    return;
  }
  const titleEl = document.getElementById("resultTitle");
  const statsEl = document.getElementById("resultStats");
  const screen = document.getElementById("resultScreen");
  if (titleEl) titleEl.textContent = title;
  if (statsEl) statsEl.textContent = stats;
  if (screen) screen.classList.add("show");
  appCtx.setPauseReason?.('game_result', true);
}

export function resetPaintTownMode() {
  const state = ensurePaintTownState();
  state.active = false;
  state.totalBuildings = 0;
  state.paintedBuildings = 0;
  state.paintedKeys.clear();
  state.claimsByKey.clear();
  state.colorCounts = {};
  state.timerSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
  state.lastHint = "";
  state.autoPaintTickSec = 0;
  state.scoreSubmitted = false;
  state.lastShotAtMs = 0;
  clearPaintballs();
  clearPaintSplats();

  if (Array.isArray(appCtx.buildingMeshes)) {
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      restorePaintTownMesh(appCtx.buildingMeshes[i]);
    }
  }
  updatePaintTownHud("");
}

export function startPaintTownMode() {
  const state = ensurePaintTownState();
  state.rules = normalizePaintTownRules({
    ...(state.rules || {}),
    ...(appCtx.paintTownRoomRules || {})
  });
  state.playerColorHex = state.multiplayerUid
    ? getPreferredPaintTownColor(state.multiplayerUid)
    : getPreferredPaintTownColor();
  setPaintTownActiveTool(preferredPaintTownTool());
  ensurePaintTownInputBindings();
  resetPaintTownMode();
  appCtx.disableNearBuildingBatching = true;

  buildPaintTownBuildingIndex();
  state.totalBuildings = new Set(state.buildingByKey.keys()).size;
  state.active = true;
  state.timerSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
  state.lastHint = "Paint challenge started. Pick tool/color and claim buildings.";
  state.autoPaintTickSec = 0;
  state.scoreSubmitted = false;

  if (state.totalBuildings <= 0) {
    state.active = false;
    state.lastHint = "No paintable buildings found yet. Reload world or choose a denser city.";
  } else if (Array.isArray(state.latestRemoteClaims) && state.latestRemoteClaims.length) {
    applyRemotePaintTownClaims(state.latestRemoteClaims, state.multiplayerRoomId || "");
  }

  updatePaintTownHud();
}

export function stopPaintTownMode({ showSummary = false } = {}) {
  const state = ensurePaintTownState();
  if (!state.active && !showSummary) return;
  state.active = false;
  clearPaintballs();
  clearPaintSplats();
  updatePaintTownHud();

  if (!showSummary) return;
  const pct = state.totalBuildings > 0 ? Math.min(100, state.paintedBuildings / state.totalBuildings * 100) : 0;
  if (!state.scoreSubmitted && typeof appCtx.submitPaintTownScore === "function") {
    state.scoreSubmitted = true;
    const actor = getPaintTownActorState();
    appCtx.submitPaintTownScore({
      paintedPct: pct,
      paintedBuildings: state.paintedBuildings,
      totalBuildings: state.totalBuildings,
      durationMs: normalizePaintDurationSec(state.rules?.paintTimeLimitSec) * 1000,
      mode: actor?.mode || "driving"
    });
  }

  const colorName = paintColorNameFromHex(state.playerColorHex);
  showPaintTownSummary(
    "Paint the Town Red",
    `Painted ${state.paintedBuildings} buildings (${colorName}) in ${fmtTime(normalizePaintDurationSec(state.rules?.paintTimeLimitSec))} (${state.totalBuildings} available)`
  );
}

function attemptAutoPaintFromActor() {
  const state = ensurePaintTownState();
  if (!state.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== "painttown") return;
  if (state.rules?.allowRoofAutoPaint !== true) return;

  const actor = getPaintTownActorState();
  if (!actor) return;
  const hit = findPaintableRoofBuilding(actor);
  if (!hit) return;

  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const painted = paintBuildingFromClaim({
    key: hit.key,
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    method: "roof"
  }, { publish: true });
  if (!painted) return;

  state.lastHint = `Auto-painted ${state.paintedBuildings}/${state.totalBuildings}.`;
  if (state.paintedBuildings >= state.totalBuildings && state.totalBuildings > 0) {
    stopPaintTownMode({ showSummary: true });
    return;
  }
  updatePaintTownHud();
}

export function updateActivePaintTownMode(dt) {
  const state = ensurePaintTownState();
  const ctrlHeld = !!(appCtx.keys?.ControlLeft || appCtx.keys?.ControlRight);
  if (state.active && ctrlHeld && !state.ctrlFireLatched && state.rules?.allowPaintballGun === true) {
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    state.ctrlFireLatched = firePaintball(cx, cy);
  }
  if (!ctrlHeld) state.ctrlFireLatched = false;

  if (state.active) updatePaintballProjectiles(dt);
  if (state.active) {
    const durationSec = normalizePaintDurationSec(state.rules?.paintTimeLimitSec);
    state.timerSec = Math.max(0, durationSec - appCtx.gameTimer);
    if (state.rules?.allowRoofAutoPaint === true) {
      state.autoPaintTickSec = Math.max(0, (state.autoPaintTickSec || 0) - dt);
      if (state.autoPaintTickSec <= 0) {
        state.autoPaintTickSec = 0.15;
        attemptAutoPaintFromActor();
      }
    }
    updatePaintTownHud();
    if (state.timerSec <= 0) stopPaintTownMode({ showSummary: true });
  }
}

export function setPaintTownMultiplayerConfig(config = {}) {
  const state = ensurePaintTownState();
  const roomId = String(config.roomId || "").trim();
  const uid = String(config.uid || getPaintTownPlayerUid()).trim();
  const incomingRules = normalizePaintTownRules(config.rules || {});

  state.multiplayerRoomId = roomId;
  state.multiplayerUid = uid || getPaintTownPlayerUid();
  state.rules = incomingRules;
  state.roomSeed = Number.isFinite(Number(config.roomSeed)) ? Number(config.roomSeed) : null;
  appCtx.paintTownRoomRules = { ...incomingRules };

  const preferred = getPreferredPaintTownColor(state.multiplayerUid || getPaintTownPlayerUid());
  state.playerColorHex = normalizePaintColorHex(state.playerColorHex || preferred, preferred);
  setPaintTownActiveTool(preferredPaintTownTool());

  if (Array.isArray(config.claims) && config.claims.length) {
    applyRemotePaintTownClaims(config.claims, roomId);
  } else {
    recomputePaintTownCounters();
  }

  updatePaintTownHud();
}

export function clearPaintTownMultiplayerConfig() {
  const state = ensurePaintTownState();
  state.multiplayerRoomId = "";
  state.multiplayerUid = "";
  state.latestRemoteClaims = [];
  state.claimsByKey.clear();
  recomputePaintTownCounters();
  state.rules = normalizePaintTownRules();
  state.roomSeed = null;
  appCtx.paintTownRoomRules = { ...state.rules };
  state.playerColorHex = getPreferredPaintTownColor();
  setPaintTownActiveTool(preferredPaintTownTool());
  updatePaintTownHud();
}

export function applyPaintTownRemoteClaimsFromSync(payload = {}) {
  const roomId = String(payload.roomId || "").trim();
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  applyRemotePaintTownClaims(claims, roomId);
}

export function paintTownDebugSnapshot() {
  const state = ensurePaintTownState();
  return {
    active: !!state.active,
    totalBuildings: Number(state.totalBuildings || 0),
    paintedBuildings: Number(state.paintedBuildings || 0),
    paintballs: Array.isArray(state.paintballs) ? state.paintballs.length : 0,
    paintSplats: Array.isArray(state.paintSplats) ? state.paintSplats.length : 0,
    playerColorHex: normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex),
    activeTool: String(state.activeTool || ""),
    hudExpanded: state.hudExpanded === true,
    rules: { ...(state.rules || {}) },
    colorCounts: { ...(state.colorCounts || {}) },
    claims: state.claimsByKey instanceof Map
      ? [...state.claimsByKey.values()].map((claim) => ({ ...claim }))
      : []
  };
}
