const PLAYER_CHARACTER_PREFERENCE_KEY = 'we3d.player-character-gender.v1';
const PLAYER_CHARACTER_GENDERS = Object.freeze(['man', 'woman']);

function normalizePlayerCharacterGender(value) {
  return PLAYER_CHARACTER_GENDERS.includes(String(value)) ? String(value) : 'man';
}

function getPlayerCharacterGender() {
  try {
    return normalizePlayerCharacterGender(localStorage.getItem(PLAYER_CHARACTER_PREFERENCE_KEY));
  } catch (_) {
    return 'man';
  }
}

function setPlayerCharacterGender(value) {
  const gender = normalizePlayerCharacterGender(value);
  try { localStorage.setItem(PLAYER_CHARACTER_PREFERENCE_KEY, gender); } catch (_) { /* local preference is optional */ }
  return gender;
}

export {
  PLAYER_CHARACTER_GENDERS,
  PLAYER_CHARACTER_PREFERENCE_KEY,
  getPlayerCharacterGender,
  normalizePlayerCharacterGender,
  setPlayerCharacterGender
};
