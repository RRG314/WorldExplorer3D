const BACKPACK_STORAGE_KEY = 'world-explorer:character-backpack:v1';

function createLocalBackpackStore(storage = globalThis.localStorage) {
  return Object.freeze({
    type: 'LocalBackpackStore',
    load() {
      if (!storage?.getItem) return null;
      try {
        const value = JSON.parse(storage.getItem(BACKPACK_STORAGE_KEY) || 'null');
        return value && typeof value === 'object' ? value : null;
      } catch (_) {
        return null;
      }
    },
    save(snapshot) {
      if (!storage?.setItem || !snapshot) return false;
      try {
        storage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(snapshot));
        return true;
      } catch (_) {
        return false;
      }
    },
    key: BACKPACK_STORAGE_KEY
  });
}

export { BACKPACK_STORAGE_KEY, createLocalBackpackStore };
