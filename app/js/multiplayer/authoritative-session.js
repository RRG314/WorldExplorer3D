import { BLOCK_MATERIALS } from '../block-builder/catalog.js?v=4';
import { createAuthoritativeRoomClient } from './authoritative-client.js?v=7';

const INPUT_SAMPLE_MS = 50;

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function colorIndex(color) {
  const index = BLOCK_MATERIALS.findIndex((entry) => entry.id === String(color || ''));
  return index >= 0 ? index : 0;
}

function rotationStep(radians) {
  const step = Math.round(finite(radians) / (Math.PI * 0.5));
  return ((step % 4) + 4) % 4;
}

function objectToBlock(object) {
  return {
    id: String(object.id || ''),
    gx: Math.round(finite(object.position?.x)),
    gy: Math.round(finite(object.position?.y) * 2) / 2,
    gz: Math.round(finite(object.position?.z)),
    materialIndex: colorIndex(object.color),
    shape: String(object.shape || 'cube'),
    rotation: rotationStep(object.rotation?.y),
    createdBy: String(object.ownerUid || '')
  };
}

function gridKey(entry) {
  return `${Math.round(finite(entry?.gx))}|${Math.round(finite(entry?.gy) * 2) / 2}|${Math.round(finite(entry?.gz))}`;
}

function inputFromPose(previous, current) {
  const pose = current?.pose || {};
  const previousPose = previous?.pose || pose;
  const dx = finite(pose.x) - finite(previousPose.x);
  const dz = finite(pose.z) - finite(previousPose.z);
  const magnitude = Math.hypot(dx, dz);
  return {
    x: magnitude > 0.001 ? dx / magnitude : 0,
    z: magnitude > 0.001 ? dz / magnitude : 0,
    yaw: finite(pose.yaw),
    mode: String(current?.mode || 'walk')
  };
}

async function startAuthoritativeRoomSession(options) {
  const client = createAuthoritativeRoomClient();
  if (!client.enabled) return null;
  const room = options.room;
  const appCtx = options.appCtx;
  const userUid = String(options.userUid || '');
  let lastSnapshot = null;
  let previousPose = null;
  let inputTimer = null;
  let stopped = false;
  let objectsByGrid = new Map();
  let progressionKey = '';

  const releaseState = client.subscribe((snapshot) => {
    lastSnapshot = snapshot;
    const blocks = snapshot.objects.map(objectToBlock);
    objectsByGrid = new Map(blocks.map((entry) => [gridKey(entry), entry]));
    appCtx.setSharedBuildEntries?.(blocks);
    appCtx.applyRoomBaseSuppressions?.(snapshot.suppressions || []);
    options.onPlayers?.(snapshot.players, snapshot.selfUid);
    const nextProgressionKey = JSON.stringify([
      snapshot.progression,
      snapshot.leaderboard,
      snapshot.catalog
    ]);
    if (nextProgressionKey !== progressionKey) {
      progressionKey = nextProgressionKey;
      options.onProgression?.(snapshot.progression, snapshot.leaderboard, snapshot.catalog);
    }
  });
  const releaseStatus = client.subscribeStatus((event) => options.onStatus?.(event));
  const releaseGameEvents = client.subscribeGameEvents((event) => options.onGameEvent?.(event));

  try {
    await client.connect(room);
  } catch (error) {
    releaseState();
    releaseStatus();
    releaseGameEvents();
    await client.disconnect().catch(() => {});
    throw error;
  }

  appCtx.configureSharedBuildSync?.({
    enabled: true,
    roomId: room.id,
    upsert: (entry) => client.send('world.object.place', {
      assetId: `block.${entry.shape}`,
      position: { x: entry.gx, y: entry.gy, z: entry.gz },
      rotation: { x: 0, y: entry.rotation * Math.PI * 0.5, z: 0 },
      payload: { metadata: { color: BLOCK_MATERIALS[entry.materialIndex]?.id || 'red' } }
    }),
    remove: (entry) => {
      const authoritative = objectsByGrid.get(gridKey(entry));
      if (!authoritative?.id) throw new Error('The authoritative block has not synchronized yet.');
      return client.send('world.object.remove', { targetId: authoritative.id });
    },
    clearMine: async () => {
      const mine = Array.from(objectsByGrid.values()).filter((entry) => entry.createdBy === userUid);
      for (const entry of mine) await client.send('world.object.remove', { targetId: entry.id });
      return mine.length;
    }
  });

  inputTimer = globalThis.setInterval(() => {
    if (stopped || typeof options.readPoseSnapshot !== 'function') return;
    const currentPose = options.readPoseSnapshot();
    client.sendInput(inputFromPose(previousPose, currentPose));
    previousPose = currentPose;
  }, INPUT_SAMPLE_MS);

  return Object.freeze({
    client,
    getSnapshot: () => lastSnapshot,
    async stop() {
      if (stopped) return;
      stopped = true;
      if (inputTimer) globalThis.clearInterval(inputTimer);
      inputTimer = null;
      releaseState();
      releaseStatus();
      releaseGameEvents();
      appCtx.configureSharedBuildSync?.({ enabled: false });
      appCtx.setSharedBuildEntries?.([]);
      appCtx.clearRoomBaseSuppressions?.();
      await client.disconnect();
    }
  });
}

export {
  inputFromPose,
  objectToBlock,
  startAuthoritativeRoomSession
};
