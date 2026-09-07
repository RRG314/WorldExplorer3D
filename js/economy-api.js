import { postProtectedFunction } from './function-api.js?v=3';

async function commitExplorerCommerceAction(input = {}) {
  return postProtectedFunction('/commitExplorerCommerceAction', {
    action: String(input.action || '').slice(0, 16),
    requestId: String(input.requestId || '').slice(0, 120),
    storeId: String(input.storeId || '').slice(0, 420),
    catalogId: String(input.catalogId || '').slice(0, 100),
    targetId: String(input.targetId || '').slice(0, 180),
    dayKey: String(input.dayKey || '').slice(0, 10)
  }, { label: 'Explorer Wallet', forceRefreshToken: false });
}

async function settleExplorerCommerceOutcome(input = {}) {
  return postProtectedFunction('/settleExplorerCommerceOutcome', {
    requestId: String(input.requestId || '').slice(0, 120),
    outcome: String(input.outcome || '').slice(0, 24),
    reason: String(input.reason || '').slice(0, 120)
  }, { label: 'Explorer Wallet', forceRefreshToken: false });
}

export { commitExplorerCommerceAction, settleExplorerCommerceOutcome };
