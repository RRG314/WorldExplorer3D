// Read-only projection of the server wallet. Both property and shop consumers
// use this policy; this module never writes a balance or migrates stored data.
export const EXPLORER_CURRENCY_VERSION = 2;
const STARTING_CREDITS = 1_000_000;
const LEGACY_CURRENCY_SCALE = 2000;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function projectExplorerWallet(data = {}, { exists = false, pending = false } = {}) {
  const scale = exists && finite(data.currencyVersion) < EXPLORER_CURRENCY_VERSION ? LEGACY_CURRENCY_SCALE : 1;
  return Object.freeze({
    authority: 'explorer-wallet-v2',
    credits: Math.max(0, finite(data.credits ?? STARTING_CREDITS, STARTING_CREDITS) * scale),
    pending,
    revision: Math.max(0, finite(data.revision)),
    currencyVersion: EXPLORER_CURRENCY_VERSION
  });
}
