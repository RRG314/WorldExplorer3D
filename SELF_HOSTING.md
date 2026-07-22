# Local MMO Stack

The contributor stack runs the browser client and authoritative room service
without production credentials. It uses an in-memory room store and explicit
local-only test identities. It cannot read or modify production users or rooms.

## Docker Compose

Requirements: Docker Desktop with Compose v2.

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:4192/app/?mmoEndpoint=http://127.0.0.1:2567&mmoTestToken=test:local-owner:Local%20Owner
```

The seeded room code is `LOCAL-EARTH`. Stop and remove the local containers with:

```bash
docker compose down
```

The in-memory room state is intentionally discarded when the service stops.

## Native Node

Requirements: Node.js 22+.

```bash
npm install
npm run dev
```

In a second terminal:

```bash
WE3D_MMO_ALLOW_TEST_AUTH=true WE3D_MMO_SEED_LOCAL=true npm run dev:mmo-server
```

## Persistent Development

Firestore persistence is optional for normal contributor work. Use the Firebase
Emulator Suite and a demo project for persistence tests. Never use production
service-account files, production Firebase configuration, or real user exports.

```bash
npm run test:mmo-firestore
```

This test requires Java and the Firebase CLI. Production mode deliberately
refuses the in-memory store and local test authentication.

## Verification

```bash
npm run test:mmo
npm run test:mmo-load
npm run test:mmo-browser
npm run test:block-builder
npm run test:mobile-controls
```

See [MMO_ARCHITECTURE.md](MMO_ARCHITECTURE.md) for authority and persistence
boundaries and [CONTENT_EXTENSION_GUIDE.md](CONTENT_EXTENSION_GUIDE.md) for safe
gameplay extension points.
