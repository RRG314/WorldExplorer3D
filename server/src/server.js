import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createIdentityVerifier } from './auth/identity.js';
import { createAssetCatalog } from './content/catalog.js';
import { createInventoryPolicy } from './content/inventory-policy.js';
import { MemoryRoomStore } from './persistence/memory-store.js';
import { WorldRoom } from './room.js';

function seedDevelopmentRoom(store) {
  return store.seedRoom({
    id: 'LOCAL-EARTH',
    name: 'Local Earth Room',
    ownerUid: 'local-owner',
    members: {
      'local-builder': 'builder',
      'local-player': 'player'
    },
    world: { kind: 'earth', bodyId: 'earth', lat: 39.2904, lon: -76.6122 },
    rules: { allowBuilding: true, allowDemolition: true, allowCombat: true }
  });
}

function createMmoServer(options = {}) {
  const store = options.store || new MemoryRoomStore();
  const verifyIdentity = options.verifyIdentity || createIdentityVerifier({
    allowTestAuth: options.allowTestAuth === true
  });
  const assetCatalog = options.assetCatalog || createAssetCatalog();
  const inventoryPolicy = options.inventoryPolicy || createInventoryPolicy(assetCatalog);
  const transport = new WebSocketTransport({
    maxPayload: options.maxPayload || 32 * 1024,
    pingInterval: 5000,
    pingMaxRetries: 3
  });
  const gameServer = new Server({
    transport,
    greet: false,
    express: (app) => {
      app.disable('x-powered-by');
      app.get('/healthz', (_request, response) => response.json({
        ok: true,
        service: 'worldexplorer3d-mmo',
        protocol: 1
      }));
    }
  });
  gameServer.define('world', WorldRoom, {
    store,
    verifyIdentity,
    assetCatalog,
    inventoryPolicy
  }).filterBy(['roomKey']);
  return { assetCatalog, gameServer, inventoryPolicy, store, transport };
}

async function listenMmoServer(options = {}) {
  const runtime = createMmoServer(options);
  const port = Number.isInteger(options.port) ? options.port : 2567;
  const host = options.host || '127.0.0.1';
  await runtime.gameServer.listen(port, host);
  const address = runtime.transport.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return { ...runtime, host, port: actualPort, url: `http://${host}:${actualPort}` };
}

export { createMmoServer, listenMmoServer, seedDevelopmentRoom };
