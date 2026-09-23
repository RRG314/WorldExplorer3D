export const backendSteps = [
  { id: 'room-admission-http', command: [process.execPath, '--test', 'tests/room-admission-http-emulator.test.mjs'] },
  { id: 'room-admission', command: [process.execPath, '--test', '--test-concurrency=1', 'tests/room-admission-emulator.test.mjs'] },
  { id: 'storage-rules', command: [process.execPath, '--test', '--test-concurrency=1', 'tests/storage.rules.reality-capture.test.mjs'] },
  { id: 'firestore-rules', command: [process.execPath, '--test', 'tests/firestore.rules.security.test.mjs'] },
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
export function backendStageTimeoutMs(step, environment = process.env) {
  return environment.CI && step.id === 'multiplayer' ? 900_000 : 600_000;
}
export function backendGroupTimeoutMs(group, environment = process.env) {
  const stageMs = Math.max(...group.map(step => backendStageTimeoutMs(step, environment)));
  return stageMs > 600_000 ? stageMs + 60_000 : 600_000;
}
