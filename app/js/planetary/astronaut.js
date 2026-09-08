import { ctx as appCtx } from '../shared-context.js?v=55';
import { getAstronomicalBody, LANDING_MODE } from '../astronomy/body-catalog.js?v=3';
import {
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  EXPLORER_ASSET_BY_GENDER,
  SHIP_CREW_ASSET_ID
} from '../walking/curated-explorer-character.js?v=8';

let characterRequestId = 0;

function isPlanetaryCharacterRequestCurrent({
  requestId,
  currentRequestId = characterRequestId,
  character,
  currentCharacter = appCtx.Walk?.state?.characterMesh,
  assetId
} = {}) {
  return requestId === currentRequestId &&
    currentCharacter === character &&
    character?.userData?.requestedCuratedCharacterAssetId === assetId;
}

function desiredPlanetaryCharacter(body = 'earth') {
  const astronomicalBody = getAstronomicalBody(body);
  const planetary = astronomicalBody?.id !== 'earth' &&
    astronomicalBody?.exploration?.landingMode === LANDING_MODE.SOLID_SURFACE;
  if (planetary) {
    return Object.freeze({ assetId: SHIP_CREW_ASSET_ID, role: 'planetary-player-character', bodyId: astronomicalBody.id });
  }
  const gender = String(appCtx.getPlayerCharacterGender?.() || 'man');
  return Object.freeze({
    assetId: EXPLORER_ASSET_BY_GENDER[gender] || EXPLORER_ASSET_BY_GENDER.man,
    role: 'player-character',
    bodyId: 'earth'
  });
}

function setPlanetaryCharacter(body = 'earth') {
  const character = appCtx.Walk?.state?.characterMesh;
  if (!character) return false;
  const desired = desiredPlanetaryCharacter(body);
  const requestId = ++characterRequestId;
  character.userData.requestedCuratedCharacterAssetId = desired.assetId;
  character.userData.requestedCharacterRole = desired.role;
  character.userData.planetaryCharacterBodyId = desired.bodyId;
  if (character.userData.curatedCharacterAssetId === desired.assetId) return true;

  disposeCuratedCharacter(character);
  void attachCuratedExplorerCharacter(THREE, character, {
    assetId: desired.assetId,
    role: desired.role,
    // Environment transitions temporarily detach the character host while the
    // Earth scene is restored. The request remains valid as long as this is
    // still the authoritative player host and desired asset.
    isCurrent: () => isPlanetaryCharacterRequestCurrent({
      requestId,
      character,
      assetId: desired.assetId
    })
  });
  return true;
}

Object.assign(appCtx, { setPlanetaryCharacter });

export { desiredPlanetaryCharacter, isPlanetaryCharacterRequestCurrent, setPlanetaryCharacter };
