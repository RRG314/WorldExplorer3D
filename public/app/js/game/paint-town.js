export { normalizePaintColorHex, ensurePaintTownState, setPaintTownPlayerColor } from "./paint-town/core.js?v=1";
export { firePaintball, tryTouchPaintAt, updatePaintballProjectiles } from "./paint-town/projectiles.js?v=1";
export {
  resetPaintTownMode,
  startPaintTownMode,
  stopPaintTownMode,
  updateActivePaintTownMode,
  setPaintTownMultiplayerConfig,
  clearPaintTownMultiplayerConfig,
  applyPaintTownRemoteClaimsFromSync,
  paintTownDebugSnapshot
} from "./paint-town/runtime.js?v=1";
