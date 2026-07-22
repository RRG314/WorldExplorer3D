import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Client } from '@colyseus/sdk';
import { WorldRoomState } from '../server/src/state.js';
import { listenMmoServer } from '../server/src/server.js';

const CLIENT_COUNT = 24;
const INPUT_TICKS = 36;
const INPUT_INTERVAL_MS = 80;
const MAX_JOIN_P95_MS = 3500;
const MAX_EVENT_LOOP_P99_MS = 80;
const MAX_HEAP_GROWTH_MB = 128;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, message, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = check();
    if (value) return value;
    await delay(25);
  }
  throw new Error(message);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
}

async function connect(url, index) {
  const uid = `load-player-${String(index).padStart(2, '0')}`;
  const client = new Client(url);
  client.auth.token = `test:${uid}:Load Player ${index}`;
  const startedAt = performance.now();
  const room = await client.joinOrCreate('world', { roomKey: 'LOAD-TEST' }, WorldRoomState);
  room.onMessage('progression.snapshot', () => {});
  return { client, room, uid, joinMs: performance.now() - startedAt };
}

global.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const runtime = await listenMmoServer({ port: 0, allowTestAuth: true });
const members = Object.fromEntries(Array.from({ length: CLIENT_COUNT }, (_, index) => [
  `load-player-${String(index).padStart(2, '0')}`,
  index === 0 ? 'owner' : 'player'
]));
runtime.store.seedRoom({
  id: 'LOAD-TEST',
  ownerUid: 'load-player-00',
  members,
  world: { kind: 'earth', bodyId: 'earth', lat: 39.2904, lon: -76.6122 },
  rules: { allowBuilding: true, allowCombat: true }
});

let connections = [];
let loadFailure = null;
try {
  connections = await Promise.all(Array.from({ length: CLIENT_COUNT }, (_, index) => connect(runtime.url, index)));
  const observer = connections[0].room;
  await waitFor(
    () => observer.state.players.size === CLIENT_COUNT,
    'The load room never synchronized the complete player roster.'
  );
  eventLoop.reset();

  for (let tick = 1; tick <= INPUT_TICKS; tick += 1) {
    connections.forEach(({ room }, index) => room.send('input', {
      type: 'player.input',
      commandId: `load-input-${index}-${String(tick).padStart(4, '0')}`,
      expectedRevision: room.state.revision,
      world: { kind: 'earth', lat: 39.2904, lon: -76.6122 },
      payload: {
        sequence: tick,
        x: index % 2 ? 0.35 : -0.35,
        z: 1,
        yaw: index * 0.1,
        mode: 'walk'
      }
    }));
    await delay(INPUT_INTERVAL_MS);
  }

  await waitFor(() => {
    let moved = 0;
    observer.state.players.forEach((player) => {
      if (Math.hypot(player.x, player.z) >= 8) moved += 1;
    });
    return moved === CLIENT_COUNT;
  }, 'Not every player remained synchronized under concurrent movement.');

  const joinP95Ms = percentile(connections.map(({ joinMs }) => joinMs), 0.95);
  const eventLoopP99Ms = eventLoop.percentile(99) / 1e6;
  assert.ok(joinP95Ms <= MAX_JOIN_P95_MS, `Join p95 ${joinP95Ms.toFixed(1)}ms exceeded budget.`);
  assert.ok(eventLoopP99Ms <= MAX_EVENT_LOOP_P99_MS, `Event-loop p99 ${eventLoopP99Ms.toFixed(1)}ms exceeded budget.`);

  await Promise.allSettled(connections.map(({ room }) => room.leave()));
  await waitFor(
    () => runtime.store.playerSnapshots.get('LOAD-TEST')?.size === CLIENT_COUNT,
    'Not every player received a recovery snapshot after leaving.'
  );
  connections = [];
  global.gc?.();
  await delay(100);
  const heapGrowthMb = Math.max(0, process.memoryUsage().heapUsed - heapBefore) / 1048576;
  assert.ok(heapGrowthMb <= MAX_HEAP_GROWTH_MB, `Heap growth ${heapGrowthMb.toFixed(1)}MB exceeded budget.`);

  console.log(JSON.stringify({
    ok: true,
    clients: CLIENT_COUNT,
    inputTicks: INPUT_TICKS,
    simulationHz: 20,
    joinP95Ms: Number(joinP95Ms.toFixed(1)),
    eventLoopP99Ms: Number(eventLoopP99Ms.toFixed(1)),
    heapGrowthMb: Number(heapGrowthMb.toFixed(1)),
    recoverySnapshots: runtime.store.playerSnapshots.get('LOAD-TEST').size
  }, null, 2));
} catch (error) {
  loadFailure = error;
} finally {
  eventLoop.disable();
  await Promise.allSettled(connections.map(({ room }) => room.leave()));
  await runtime.gameServer.gracefullyShutdown(false);
}

if (loadFailure) {
  console.error(loadFailure);
  process.exitCode = 1;
}
