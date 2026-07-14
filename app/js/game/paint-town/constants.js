export const PAINT_TOWN_DURATION_SEC = 120;
export const PAINT_TOWN_MIN_DURATION_SEC = 30;
export const PAINT_TOWN_MAX_DURATION_SEC = 1800;
export const PAINTBALL_SPEED_MPS = 42;
export const PAINTBALL_GRAVITY_MPS2 = 22;
export const PAINTBALL_RADIUS_M = 0.22;
export const PAINTBALL_LIFETIME_SEC = 4.5;
export const PAINTBALL_SHOT_COOLDOWN_MS = 180;
export const PAINTBALL_MAX_ACTIVE = 24;
export const PAINT_SPLAT_LIFETIME_SEC = 3.5;
export const PAINT_SPLAT_MAX_ACTIVE = 96;
export const PAINT_SPLAT_RADIUS_M = 0.42;
export const PAINT_TOWN_TOUCH_MODES = new Set(["off", "roof", "any"]);
export const PAINT_TOWN_METHODS = new Set(["roof", "touch-roof", "touch-any", "gun"]);
export const PAINT_TOWN_COLORS = Object.freeze([
  { name: "Red", hex: "#D61F2C" },
  { name: "Blue", hex: "#1D4ED8" },
  { name: "Green", hex: "#16A34A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Purple", hex: "#9333EA" },
  { name: "Orange", hex: "#EA580C" }
]);
export const PAINT_TOWN_DEFAULT_COLOR = PAINT_TOWN_COLORS[0];
export const PAINT_TOWN_DEFAULT_RULES = Object.freeze({
  paintTimeLimitSec: PAINT_TOWN_DURATION_SEC,
  paintTouchMode: "any",
  allowPaintballGun: true,
  allowRoofAutoPaint: true
});
