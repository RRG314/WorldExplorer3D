import { ctx as appCtx } from "../../shared-context.js?v=55";
import {
  PAINT_TOWN_COLORS,
  PAINT_TOWN_DEFAULT_COLOR,
  PAINT_TOWN_DEFAULT_RULES,
  PAINT_TOWN_DURATION_SEC,
  PAINT_TOWN_MAX_DURATION_SEC,
  PAINT_TOWN_METHODS,
  PAINT_TOWN_MIN_DURATION_SEC,
  PAINT_TOWN_TOUCH_MODES
} from "./constants.js?v=1";

export function fmtTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
}

function normalizePaintTouchMode(raw) {
  const mode = String(raw || "").toLowerCase();
  return PAINT_TOWN_TOUCH_MODES.has(mode) ? mode : PAINT_TOWN_DEFAULT_RULES.paintTouchMode;
}

export function normalizePaintDurationSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return PAINT_TOWN_DEFAULT_RULES.paintTimeLimitSec;
  return Math.max(PAINT_TOWN_MIN_DURATION_SEC, Math.min(PAINT_TOWN_MAX_DURATION_SEC, Math.floor(parsed)));
}

export function normalizePaintTownRules(rawRules = {}) {
  const source = rawRules && typeof rawRules === "object" ? rawRules : {};
  return {
    paintTimeLimitSec: normalizePaintDurationSec(source.paintTimeLimitSec),
    paintTouchMode: normalizePaintTouchMode(source.paintTouchMode),
    allowPaintballGun: source.allowPaintballGun !== false,
    allowRoofAutoPaint: source.allowRoofAutoPaint !== false
  };
}

export function normalizePaintColorHex(rawHex, fallback = PAINT_TOWN_DEFAULT_COLOR.hex) {
  const text = String(rawHex || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(text)) return text;
  return String(fallback || PAINT_TOWN_DEFAULT_COLOR.hex).trim().toUpperCase();
}

export function paintColorNameFromHex(colorHex) {
  const normalized = normalizePaintColorHex(colorHex);
  const found = PAINT_TOWN_COLORS.find((entry) => entry.hex.toUpperCase() === normalized);
  return found ? found.name : "Custom";
}

export function paintColorHexToInt(colorHex) {
  const normalized = normalizePaintColorHex(colorHex).slice(1);
  return Number.parseInt(normalized, 16);
}

export function normalizePaintMethod(rawMethod) {
  const method = String(rawMethod || "").toLowerCase();
  return PAINT_TOWN_METHODS.has(method) ? method : "touch-any";
}

export function getPaintTownPlayerUid() {
  const authUid = String(globalThis.__WE3D_AUTH_UID__ || "").trim();
  return authUid || "local-player";
}

export function getPreferredPaintTownColor(uid = "") {
  const userKey = String(uid || getPaintTownPlayerUid()).trim();
  if (!userKey) return PAINT_TOWN_DEFAULT_COLOR.hex;
  try {
    const stored = localStorage.getItem(`worldExplorer3D.paintTown.color.${userKey}`);
    return normalizePaintColorHex(stored, PAINT_TOWN_DEFAULT_COLOR.hex);
  } catch {
    return PAINT_TOWN_DEFAULT_COLOR.hex;
  }
}

function setPreferredPaintTownColor(colorHex, uid = "") {
  const normalized = normalizePaintColorHex(colorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const userKey = String(uid || getPaintTownPlayerUid()).trim();
  if (!userKey) return normalized;
  try {
    localStorage.setItem(`worldExplorer3D.paintTown.color.${userKey}`, normalized);
  } catch {
    // Ignore storage failures.
  }
  return normalized;
}

export function ensurePaintTownState() {
  if (!appCtx.paintTown) {
    appCtx.paintTown = {
      active: false,
      totalBuildings: 0,
      paintedBuildings: 0,
      paintedKeys: new Set(),
      timerSec: PAINT_TOWN_DURATION_SEC,
      lastHint: "",
      autoPaintTickSec: 0,
      scoreSubmitted: false,
      colorCounts: {},
      claimsByKey: new Map(),
      buildingByKey: new Map(),
      sourceIdToKey: new Map(),
      footprintToKey: new Map(),
      playerColorHex: getPreferredPaintTownColor(),
      activeTool: "gun",
      rules: normalizePaintTownRules(),
      paintballs: [],
      paintSplats: [],
      inputBound: false,
      multiplayerRoomId: "",
      multiplayerUid: "",
      roomSeed: null,
      remoteSyncRevision: 0,
      lastShotAtMs: 0,
      ctrlFireLatched: false,
      hudBound: false,
      hudExpanded: false,
      hudRenderSig: "",
      latestRemoteClaims: []
    };
  }

  if (!(appCtx.paintTown.paintedKeys instanceof Set)) appCtx.paintTown.paintedKeys = new Set();
  if (!(appCtx.paintTown.claimsByKey instanceof Map)) appCtx.paintTown.claimsByKey = new Map();
  if (!(appCtx.paintTown.buildingByKey instanceof Map)) appCtx.paintTown.buildingByKey = new Map();
  if (!(appCtx.paintTown.sourceIdToKey instanceof Map)) appCtx.paintTown.sourceIdToKey = new Map();
  if (!(appCtx.paintTown.footprintToKey instanceof Map)) appCtx.paintTown.footprintToKey = new Map();
  if (!Array.isArray(appCtx.paintTown.paintballs)) appCtx.paintTown.paintballs = [];
  if (!Array.isArray(appCtx.paintTown.paintSplats)) appCtx.paintTown.paintSplats = [];
  if (!Array.isArray(appCtx.paintTown.latestRemoteClaims)) appCtx.paintTown.latestRemoteClaims = [];

  appCtx.paintTown.rules = normalizePaintTownRules(appCtx.paintTown.rules);
  appCtx.paintTown.playerColorHex = normalizePaintColorHex(
    appCtx.paintTown.playerColorHex,
    getPreferredPaintTownColor()
  );
  appCtx.paintTown.activeTool = String(appCtx.paintTown.activeTool || "").toLowerCase() === "touch" ? "touch" : "gun";
  appCtx.paintTown.ctrlFireLatched = appCtx.paintTown.ctrlFireLatched === true;
  appCtx.paintTown.hudExpanded = appCtx.paintTown.hudExpanded === true;
  appCtx.paintTown.hudRenderSig = String(appCtx.paintTown.hudRenderSig || "");
  return appCtx.paintTown;
}

function ensurePaintTownHud() {
  let hud = document.getElementById("paintTownHud");
  if (hud) return hud;

  hud = document.createElement("div");
  hud.id = "paintTownHud";
  hud.style.position = "fixed";
  hud.style.top = "20px";
  hud.style.left = "50%";
  hud.style.transform = "translateX(-50%)";
  hud.style.zIndex = "90";
  hud.style.minWidth = "220px";
  hud.style.maxWidth = "88vw";
  hud.style.padding = "8px 10px";
  hud.style.borderRadius = "12px";
  hud.style.border = "1px solid rgba(220, 38, 38, 0.45)";
  hud.style.background = "rgba(10, 15, 28, 0.86)";
  hud.style.backdropFilter = "blur(6px)";
  hud.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.35)";
  hud.style.color = "#f8fafc";
  hud.style.fontFamily = "'Poppins', sans-serif";
  hud.style.fontSize = "11px";
  hud.style.lineHeight = "1.35";
  hud.style.display = "none";
  hud.style.pointerEvents = "auto";
  document.body.appendChild(hud);
  return hud;
}

export function getPaintTownActorState() {
  if (appCtx.droneMode && appCtx.drone) {
    return { x: appCtx.drone.x, z: appCtx.drone.z, feetY: appCtx.drone.y, mode: "drone" };
  }
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === "walk" && appCtx.Walk.state.walker) {
    const walker = appCtx.Walk.state.walker;
    const eyeHeight = appCtx.Walk?.CFG?.eyeHeight || 1.7;
    return { x: walker.x, z: walker.z, feetY: walker.y - eyeHeight, mode: "walking" };
  }
  if (appCtx.car) {
    return { x: appCtx.car.x, z: appCtx.car.z, feetY: appCtx.car.y, mode: "driving" };
  }
  return null;
}

export function getPaintTownRules() {
  const state = ensurePaintTownState();
  state.rules = normalizePaintTownRules(state.rules);
  return state.rules;
}

export function paintTownAllowsTouch() {
  return getPaintTownRules().paintTouchMode !== "off";
}

export function paintTownAllowsGun() {
  return getPaintTownRules().allowPaintballGun === true;
}

export function preferredPaintTownTool() {
  if (paintTownAllowsGun()) return "gun";
  if (paintTownAllowsTouch()) return "touch";
  return "touch";
}

export function setPaintTownActiveTool(nextTool) {
  const state = ensurePaintTownState();
  const desired = String(nextTool || "").toLowerCase() === "gun" ? "gun" : "touch";
  if (desired === "touch" && !paintTownAllowsTouch()) {
    state.activeTool = paintTownAllowsGun() ? "gun" : preferredPaintTownTool();
    return;
  }
  if (desired === "gun" && !paintTownAllowsGun()) {
    state.activeTool = paintTownAllowsTouch() ? "touch" : preferredPaintTownTool();
    return;
  }
  state.activeTool = desired;
}

export function setPaintTownPlayerColor(colorHex) {
  const state = ensurePaintTownState();
  state.playerColorHex = setPreferredPaintTownColor(colorHex, state.multiplayerUid || getPaintTownPlayerUid());
  updatePaintTownHud();
}

export function updatePaintTownHud(message = "", options = {}) {
  const state = ensurePaintTownState();
  const hud = ensurePaintTownHud();
  if (!state.active) {
    hud.style.display = "none";
    hud.classList.remove("show");
    state.hudRenderSig = "";
    return;
  }

  const force = options && options.force === true;
  const rules = getPaintTownRules();
  const hint = message || state.lastHint || "";
  const canTouch = rules.paintTouchMode !== "off";
  const canGun = rules.allowPaintballGun === true;
  if (state.activeTool === "touch" && !canTouch) state.activeTool = canGun ? "gun" : preferredPaintTownTool();
  if (state.activeTool === "gun" && !canGun) state.activeTool = canTouch ? "touch" : preferredPaintTownTool();

  const timeText = fmtTime(state.timerSec);
  const countText = `${state.paintedBuildings}/${state.totalBuildings}`;
  const hudSignature = [
    timeText,
    countText,
    state.hudExpanded ? "expanded" : "compact",
    state.activeTool,
    normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex),
    hint
  ].join("|");
  if (!force && hudSignature === state.hudRenderSig) return;
  state.hudRenderSig = hudSignature;

  if (!state.hudExpanded) {
    hud.innerHTML =
      `<button type="button" data-paint-toggle="open" style="display:flex;align-items:center;gap:12px;width:100%;background:transparent;border:0;color:#f8fafc;padding:0;margin:0;font:inherit;cursor:pointer">` +
      `<span style="font-weight:700">Time ${timeText}</span>` +
      `<span style="font-weight:700">Painted ${countText}</span>` +
      `<span style="margin-left:auto;color:#cbd5e1;font-size:12px">▾</span>` +
      `</button>`;
  } else {
    const colorButtons = PAINT_TOWN_COLORS.map((entry) => {
      const normalizedEntryHex = normalizePaintColorHex(entry.hex);
      const active = normalizePaintColorHex(state.playerColorHex) === normalizedEntryHex;
      return `<button type="button" data-paint-color="${normalizedEntryHex}" title="${entry.name}" style="width:20px;height:20px;border-radius:999px;border:${active ? "2px solid #f8fafc" : "1px solid rgba(248,250,252,0.35)"};background:${normalizedEntryHex};cursor:pointer;padding:0;outline:none"></button>`;
    }).join("");

    const toolButtons = [
      { id: "touch", label: rules.paintTouchMode === "roof" ? "Touch (Roof)" : "Touch", enabled: canTouch },
      { id: "gun", label: "Paintball Gun", enabled: canGun }
    ].map((tool) => {
      const active = state.activeTool === tool.id;
      const disabled = !tool.enabled;
      return `<button type="button" data-paint-tool="${tool.id}" ${disabled ? "disabled" : ""} style="border:${active ? "1px solid #f8fafc" : "1px solid rgba(148,163,184,0.55)"};background:${active ? "rgba(30,64,175,0.45)" : "rgba(15,23,42,0.45)"};color:${disabled ? "#64748b" : "#e2e8f0"};border-radius:8px;padding:5px 9px;font-size:11px;font-weight:600;cursor:${disabled ? "not-allowed" : "pointer"}">${tool.label}</button>`;
    }).join("");

    const selectedColorName = paintColorNameFromHex(state.playerColorHex);
    hud.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">` +
      `<div style="font-weight:700;color:#fecaca">🟥 Paint the Town</div>` +
      `<button type="button" data-paint-toggle="close" style="margin-left:auto;border:1px solid rgba(148,163,184,0.6);background:rgba(15,23,42,0.45);color:#e2e8f0;border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer">Collapse</button>` +
      `</div>` +
      `<div style="font-weight:600">Time: ${timeText} • Buildings: ${countText}</div>` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px">${toolButtons}</div>` +
      `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px"><span style="font-size:11px;color:#cbd5e1">Color:</span>${colorButtons}<span style="font-size:11px;color:#cbd5e1">(${selectedColorName})</span></div>` +
      `<div style="margin-top:6px;color:#cbd5e1;font-size:11px">Press Ctrl (Control) to fire paintballs. Gun shots arc with gravity, so aim higher for far targets.</div>` +
      (hint ? `<div style="margin-top:4px;color:#cbd5e1;font-size:11px">${hint}</div>` : "");
  }

  hud.style.display = "block";
  hud.classList.add("show");

  if (!state.hudBound) {
    state.hudBound = true;
    hud.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const toggleBtn = target.closest("button[data-paint-toggle]");
      if (toggleBtn instanceof HTMLElement) {
        state.hudExpanded = String(toggleBtn.dataset.paintToggle || "") === "open";
        state.hudRenderSig = "";
        updatePaintTownHud("", { force: true });
        return;
      }

      const colorBtn = target.closest("button[data-paint-color]");
      if (colorBtn instanceof HTMLElement) {
        const nextHex = String(colorBtn.dataset.paintColor || "").trim();
        if (nextHex) {
          setPaintTownPlayerColor(nextHex);
          state.hudRenderSig = "";
          updatePaintTownHud("", { force: true });
        }
        return;
      }

      const toolBtn = target.closest("button[data-paint-tool]");
      if (toolBtn instanceof HTMLElement) {
        setPaintTownActiveTool(toolBtn.dataset.paintTool || "");
        state.hudRenderSig = "";
        updatePaintTownHud("", { force: true });
      }
    });
  }
}
