const EXPLORER_APPEARANCE_STORAGE_KEY = 'world-explorer:appearance:v1';

const EXPLORER_APPEARANCES = Object.freeze([
  Object.freeze({ id: 'trail-hoodie', label: 'Trail Hoodie', description: 'Weather hoodie, trail shoes, and a full day pack.', shell: 0x3d5960, secondary: 0x263940, pants: 0x252c32, shoes: 0x342f29, pack: 0x24363c, accent: 0xd59a42, skin: 0xb87f61, hair: 0x261b17, hood: true, cap: false, hairStyle: 'short' }),
  Object.freeze({ id: 'field-jacket', label: 'Field Jacket', description: 'Layered field jacket, utility belt, and compact survey pack.', shell: 0x58674e, secondary: 0x333e32, pants: 0x30383b, shoes: 0x2c2925, pack: 0x454438, accent: 0xc67f35, skin: 0xd2a17e, hair: 0x493126, hood: false, cap: true, hairStyle: 'short' }),
  Object.freeze({ id: 'city-explorer', label: 'City Explorer', description: 'Light urban shell, walking shoes, and a slim camera pack.', shell: 0x314b6b, secondary: 0x1f3047, pants: 0x292b36, shoes: 0x20252b, pack: 0x1d2934, accent: 0x5fb2c9, skin: 0x6f4938, hair: 0x171412, hood: false, cap: false, hairStyle: 'coiled' })
]);

const EXPLORER_APPEARANCE_BY_ID = new Map(EXPLORER_APPEARANCES.map((entry) => [entry.id, entry]));

function getExplorerAppearance(id) {
  return EXPLORER_APPEARANCE_BY_ID.get(String(id || '')) || EXPLORER_APPEARANCES[0];
}

function readExplorerAppearanceId() {
  try { return getExplorerAppearance(localStorage.getItem(EXPLORER_APPEARANCE_STORAGE_KEY)).id; }
  catch (_) { return EXPLORER_APPEARANCES[0].id; }
}

function saveExplorerAppearanceId(id) {
  const appearance = getExplorerAppearance(id);
  try { localStorage.setItem(EXPLORER_APPEARANCE_STORAGE_KEY, appearance.id); } catch (_) {}
  document.dispatchEvent(new CustomEvent('world-explorer:appearance-changed', { detail: { id: appearance.id } }));
  return appearance;
}

export { EXPLORER_APPEARANCES, EXPLORER_APPEARANCE_STORAGE_KEY, getExplorerAppearance, readExplorerAppearanceId, saveExplorerAppearanceId };
