import './distribution-context.js?v=1';

export const isGooglePlay = globalThis.WorldExplorerDistribution.isGooglePlay;
export const distributionUrl = globalThis.WorldExplorerDistribution.url;

export function assertWebPurchasesAvailable() {
  if (isGooglePlay) throw new Error('Purchases are unavailable in this edition. Existing account benefits remain available.');
}
