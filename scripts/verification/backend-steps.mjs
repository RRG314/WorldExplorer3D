export const backendSteps = [
  { id: 'room-admission-http', command: [process.execPath, '--test', 'tests/room-admission-http-emulator.test.mjs'] },
  { id: 'room-admission', command: [process.execPath, '--test', '--test-concurrency=1', 'tests/room-admission-emulator.test.mjs'] },
  { id: 'storage-rules', command: [process.execPath, '--test', '--test-concurrency=1', 'tests/storage.rules.reality-capture.test.mjs'] },
  { id: 'firestore-rules', command: [process.execPath, '--test', '--test-concurrency=1', 'tests/firestore.rules.security.test.mjs', 'tests/room-profile-emulator.test.mjs'] },
  { id: 'discovery-receipts', command: [process.execPath, '--test', 'tests/discovery-receipt-endpoint-current.test.mjs'] },
  { id: 'public-user-count', command: [process.execPath, 'scripts/verification/public-user-count-backend-current.mjs'] },
  { id: 'connected-property-backend', command: [process.execPath, 'scripts/verification/connected-property-backend-current.mjs'] },
  { id: 'urban-civic-backend', command: [process.execPath, 'scripts/verification/urban-civic-backend-current.mjs'] },
  { id: 'shared-expedition', command: [process.execPath, 'scripts/verification/interstellar-shared.mjs'] },
  { id: 'connected-property-multiplayer', command: [process.execPath, 'scripts/verification/connected-property-multiplayer-current.mjs'] },
  { id: 'room-chat-gameplay', command: [process.execPath, 'scripts/verification/room-chat-gameplay.mjs'] },
  { id: 'multiplayer', command: [process.execPath, 'scripts/verification/multiplayer.mjs'] },
  { id: 'account-backend', command: [process.execPath, 'scripts/verification/account-backend-current.mjs'] },
];

export const backendGroups = [backendSteps.slice(0, 8), ...backendSteps.slice(8).map(step => [step])];

// Both wrappers use these deadlines. CI compiles two complete Earth worlds
// serially before exercising shared vehicles; emulator startup/teardown must
// fit outside the browser's allowance rather than silently overriding it.
// The recorded two-world journey reached claim/retention/drive/release at 15m
// on software CI; allow its second-player handoff too. This is not a physical
// performance budget and no action or authority assertion is relaxed.
export function backendStageTimeoutMs(step, environment = process.env) {
  return environment.CI && step.id === 'multiplayer' ? 1_800_000 : 600_000;
}
export function backendGroupTimeoutMs(group, environment = process.env) {
  const stageMs = Math.max(...group.map(step => backendStageTimeoutMs(step, environment)));
  return stageMs > 600_000 ? stageMs + 60_000 : 600_000;
}


// Explicit diagnostic subsets preserve group isolation and never masquerade
// as the complete backend gate. Default release execution still selects all.
export function selectBackendGroups(stageList = null) {
  if (stageList === null) return { groups: backendGroups, completeGate: true, selectedStages: null };
  const ids = String(stageList).split(',');
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !backendSteps.some(step => step.id === id))) {
    throw new Error('Invalid backend diagnostic stage selection');
  }
  return {
    groups: backendGroups.map(group => group.filter(step => ids.includes(step.id))).filter(group => group.length),
    completeGate: false,
    selectedStages: ids
  };
}
