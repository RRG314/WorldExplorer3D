import { experienceById } from '../experiences/catalog.js';
import { createCharacter, createDefaultCharacterState } from './model.js?v=1';
import { EXPLORER_ASSET_BY_GENDER } from '../walking/curated-explorer-character.js?v=8';

function preferences(profile) {
  const value = profile?.journeyPreferences;
  if (value != null && value.schemaVersion !== 1)
    throw new Error(
      'Your saved introduction needs a newer version of World Explorer. Your progress has been kept.'
    );
  return value || { schemaVersion: 1 };
}
function readyCareer(id) {
  const entry = experienceById(id);
  if (!entry || entry.kind !== 'career' || entry.releaseStatus !== 'ready')
    throw new TypeError('Choose a ready career or Free Explorer.');
  return entry;
}
export function applyCareerFocus(profile, id, now = Date.now()) {
  const previous = preferences(profile);
  if (id != null) readyCareer(id);
  return {
    ...profile,
    journeyPreferences: { ...previous, schemaVersion: 1, activeFocusId: id, updatedAt: now },
  };
}
// Called only from the existing profile store's latest-profile transaction.
// Choosing an interest never creates an item, vehicle, mission, XP or wallet.
export function applyPlayerIntroduction(
  profile,
  input,
  { now = Date.now(), ownsVehicle = (id) => id === 'bmw_e34' } = {}
) {
  const previous = preferences(profile),
    career = readyCareer(input.careerId);
  if (!Object.hasOwn(EXPLORER_ASSET_BY_GENDER, input.gender))
    throw new TypeError('Choose an Explorer appearance.');
  if (!ownsVehicle(input.vehicleId))
    throw new Error('Choose an owned car. Additional cars are available from the Garage.');
  const original = profile.characterState || createDefaultCharacterState({ now });
  if (original.schemaVersion !== 1)
    throw new Error('Your character needs a newer version of World Explorer.');
  const appearanceRef = EXPLORER_ASSET_BY_GENDER[input.gender];
  const characterState =
    !original.creationComplete && original.revision === 0 && !original.rewardLedger?.length
      ? createCharacter({
          mode: 'recommended',
          backgroundId: 'general-explorer',
          characterId: original.characterId,
          appearanceRef,
          now,
        })
      : {
          ...original,
          appearanceRef,
          creationComplete: true,
          revision: original.revision + 1,
          updatedAt: now,
        };
  return {
    ...profile,
    characterState,
    journeyPreferences: {
      ...previous,
      schemaVersion: 1,
      explorerName:
        String(input.name || '')
          .trim()
          .slice(0, 32) || 'Explorer',
      gender: input.gender,
      startingCareerId: previous.startingCareerId || career.id,
      activeFocusId: career.id === 'career:explorer' ? null : career.id,
      vehicleId: input.vehicleId,
      introCompletedAt: previous.introCompletedAt || now,
      updatedAt: now,
    },
  };
}
