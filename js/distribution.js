import './distribution-context.js?v=2';

export const isGooglePlay = globalThis.WorldExplorerDistribution.isGooglePlay;
export const isAppStore = globalThis.WorldExplorerDistribution.isAppStore;
export const isStoreEdition = globalThis.WorldExplorerDistribution.isStoreEdition === true || isGooglePlay === true || isAppStore === true;
export const distributionUrl = globalThis.WorldExplorerDistribution.url;

export function assertWebPurchasesAvailable() {
  if (isStoreEdition) throw new Error('Purchases are unavailable in this edition. Existing account benefits remain available.');
}
