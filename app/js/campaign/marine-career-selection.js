// Selection belongs to the existing marine research service. Domains keep
// their own instruments and profile transactions; only one is visible at once.
export function createMarineCareerSelection(careers) {
  let generation = 0,
    selected = null;
  return {
    async choose(id, variantId, { isCurrent = () => true } = {}) {
      const career = careers[id];
      if (!career) throw Error('Choose an available marine study.');
      if (!isCurrent()) return false;
      const token = ++generation;
      for (const other of Object.values(careers)) other.pause();
      selected = null;
      const current = () => token === generation && isCurrent();
      const accepted = await career.choose(variantId, { isCurrent: current });
      if (!current() || accepted === false) {
        if (token === generation) career.pause();
        return false;
      }
      selected = id;
      return true;
    },
    pause() {
      generation++;
      selected = null;
      for (const career of Object.values(careers)) career.pause();
    },
    snapshot() {
      return selected ? careers[selected].snapshot() : null;
    },
    get selected() {
      return selected;
    },
  };
}
