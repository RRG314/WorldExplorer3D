import { postProtectedFunction } from './function-api.js?v=3';

async function saveExplorerPlayerCondition(input = {}) {
  return postProtectedFunction('/saveExplorerPlayerCondition', {
    condition: Number(input.condition),
    reason: String(input.reason || '').slice(0, 80)
  }, { label: 'Explorer State', forceRefreshToken: false });
}

export { saveExplorerPlayerCondition };
