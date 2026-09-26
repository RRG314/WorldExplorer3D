import { createPlayerCharacterHost } from './player-character-host.js';
import {
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  EXPLORER_ASSET_BY_GENDER,
  updateCuratedCharacterAnimation
} from './curated-explorer-character.js?v=8';
import {
  getPlayerCharacterGender,
  setPlayerCharacterGender as savePlayerCharacterGender
} from '../../../js/player-character-preference.js?v=1';

function createWalkingCharacterHelpers({ THREE, scene }) {
  function attachSelectedCharacter(character, gender = getPlayerCharacterGender()) {
    const assetId = EXPLORER_ASSET_BY_GENDER[gender] || EXPLORER_ASSET_BY_GENDER.man;
    character.userData.playerCharacterGender = gender;
    character.userData.requestedCuratedCharacterAssetId = assetId;
    disposeCuratedCharacter(character);
    delete character.userData.curatedCharacterLoadStarted;
    void attachCuratedExplorerCharacter(THREE, character, {
      assetId,
      role: 'player-character',
      failClosed: true,
      isCurrent: () => character.parent === scene && character.userData.requestedCuratedCharacterAssetId === assetId
    });
    return gender;
  }

  function createCharacterMesh() {
    const character = createPlayerCharacterHost(THREE);
    scene.add(character);
    attachSelectedCharacter(character);
    return character;
  }

  function setPlayerCharacterGender(character, value) {
    const gender = savePlayerCharacterGender(value);
    const assetId = EXPLORER_ASSET_BY_GENDER[gender];
    if (character?.userData?.curatedCharacterAssetId === assetId) {
      character.userData.playerCharacterGender = gender;
      return gender;
    }
    if (character) attachSelectedCharacter(character, gender);
    return gender;
  }

  function animateCharacterWalk(characterMesh, isMoving, deltaTime, isRunning = false) {
    if (characterMesh) updateCuratedCharacterAnimation(characterMesh, isMoving, deltaTime, isRunning);
  }

  return {
    animateCharacterWalk,
    createCharacterMesh,
    getPlayerCharacterGender,
    setPlayerCharacterGender
  };
}

export { createWalkingCharacterHelpers };
