import { postProtectedFunction } from './function-api.js?v=3';

async function saveExplorerPlayerCondition(input = {}) {
  return postProtectedFunction('/saveExplorerPlayerCondition', {
    condition: Number(input.condition),
    reason: String(input.reason || '').slice(0, 80),
    ...(input.mutationId ? {mutationId:input.mutationId,expectedRevision:input.expectedRevision} : {})
  }, { label: 'Explorer State', forceRefreshToken: false, expectedUserId:input.expectedUserId });
}

export { saveExplorerPlayerCondition };

export function commitExplorerVehicleAction(input={}) {
  const {expectedUserId,...command}=input;
  return postProtectedFunction('/commitExplorerVehicleAction',command,{label:'Vehicle garage',forceRefreshToken:false,expectedUserId});
}
