// A getter installed during world creation must not close over that world's
// state. VM property feedback and presentation callbacks can retain it later.
export function bindPlayerConditionAuthority(state) {
  const authority = state.playerConditionAuthority;
  Object.defineProperty(state, 'playerCondition', {
    configurable: true,
    enumerable: true,
    get: () => authority.snapshot().condition,
    set: value => { authority.set(value, 'urban-runtime'); }
  });
}
