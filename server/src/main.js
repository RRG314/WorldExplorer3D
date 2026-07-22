import { listenMmoServer, seedDevelopmentRoom } from './server.js';
import { createFirestoreRoomStore } from './persistence/firestore-store.js';

const port = Math.max(1, Number(process.env.PORT) || 2567);
const host = process.env.HOST || '0.0.0.0';
const allowTestAuth = process.env.WE3D_MMO_ALLOW_TEST_AUTH === 'true';
const storeMode = String(process.env.WE3D_MMO_STORE || 'memory').toLowerCase();
if (process.env.NODE_ENV === 'production' && allowTestAuth) {
  throw new Error('Production MMO service cannot enable local test authentication.');
}
if (process.env.NODE_ENV === 'production' && storeMode !== 'firestore') {
  throw new Error('Production MMO service requires WE3D_MMO_STORE=firestore.');
}
const store = storeMode === 'firestore' ? createFirestoreRoomStore() : undefined;
const runtime = await listenMmoServer({ port, host, allowTestAuth, store });

if (process.env.WE3D_MMO_SEED_LOCAL === 'true') seedDevelopmentRoom(runtime.store);
console.log(`WorldExplorer3D MMO room service listening on ${runtime.url}`);
