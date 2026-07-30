const WATER_LOCATION_PATTERNS = Object.freeze([
  { kind: 'lake', pattern: /\b(lake|reservoir|pond|loch)\b/i },
  { kind: 'harbor', pattern: /\b(harbour|harbor|marina|port)\b/i },
  { kind: 'channel', pattern: /\b(river|canal|channel)\b/i },
  { kind: 'coastal', pattern: /\b(bay|gulf|strait|sound|lagoon|estuary)\b/i },
  { kind: 'open_ocean', pattern: /\b(ocean|sea|open water)\b/i }
]);

function inferSelectedLocationWaterKind(appCtx) {
  const location = appCtx?.LOC || {};
  const text = [
    location.name,
    location.region,
    location.state,
    location.country,
    appCtx?.customLoc?.name,
    appCtx?.customLoc?.region,
    appCtx?.customLoc?.state,
    appCtx?.customLoc?.country,
    appCtx?.currentLocationName
  ].filter(Boolean).join(' ');
  return WATER_LOCATION_PATTERNS.find((entry) => entry.pattern.test(text))?.kind || null;
}

export { inferSelectedLocationWaterKind };
