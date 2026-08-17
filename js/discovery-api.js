import { postProtectedFunction } from './function-api.js?v=1';

export async function claimExplorerDiscovery(input = {}) {
  return postProtectedFunction('/claimExplorerDiscovery', input, { label: 'World Discovery API' });
}

export async function listExplorerDiscoveries() {
  return postProtectedFunction('/listExplorerDiscoveries', {}, { label: 'World Discovery API' });
}

export async function createDiscoveryTrade(input = {}) {
  return postProtectedFunction('/createDiscoveryTrade', input, { label: 'World Discovery Trade API' });
}

export async function acceptDiscoveryTrade(tradeId) {
  return postProtectedFunction('/acceptDiscoveryTrade', { tradeId }, { label: 'World Discovery Trade API' });
}

export async function cancelDiscoveryTrade(tradeId) {
  return postProtectedFunction('/cancelDiscoveryTrade', { tradeId }, { label: 'World Discovery Trade API' });
}
