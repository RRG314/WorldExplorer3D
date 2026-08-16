const PROFILE_DETAIL_MODES = new Set(['grass', 'soil', 'sand', 'rock', 'snow', 'forest']);

export function resolveWorldCoverDetailMode(profile, result) {
  const profileMode = String(profile?.visualMode || profile?.mode || '');
  if (profileMode === 'built') return 'grass';
  if (profileMode === 'snowRock') return 'rock';
  if (PROFILE_DETAIL_MODES.has(profileMode)) return profileMode;

  const dominantClass = String(result?.dominantClass || '');
  if (dominantClass === 'crop') return 'soil';
  if (dominantClass === 'bare') return 'rock';
  if (dominantClass === 'snow') return 'snow';
  if (dominantClass === 'tree' || dominantClass === 'mangrove') return 'forest';
  return 'grass';
}
