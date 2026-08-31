# World Explorer 3D — Standalone Local Edition

The standalone local edition lets you run World Explorer 3D on your own
computer without connecting the game to a Firebase project. It uses the same
game code as the published world, with accounts and shared online services
switched off.

## Start the world

You need Node.js 20 or newer and a browser with WebGL support.

```bash
git clone --branch steven/local-standalone-5.1.0 --single-branch https://github.com/RRG314/WorldExplorer3D.git WorldExplorer3D-Standalone
cd WorldExplorer3D-Standalone
npm run dev:standalone
```

Open [http://127.0.0.1:4192/app/](http://127.0.0.1:4192/app/).

The standalone server uses Node's built-in modules, so there is no package
installation or Firebase setup step. Keep the terminal window open while you
play. Press `Ctrl+C` in that window to stop the server.

## What works locally

- Earth, ocean, and space exploration
- Walking, driving, boating, aircraft, and other traversal modes
- Backpack, Journal, Field Guide, companions, and local progression
- Browser-based local saves and personal builds
- Public map and environment providers when an internet connection is available
- Keyboard, mouse, touch, and supported gamepad controls

## What stays online-only

- Accounts and sign-in
- Cloud saves and cross-device sync
- Multiplayer presence, rooms, chat, and shared activities
- Shared builds, contributions, moderation, and administration
- Live cloud leaderboards and payments

The local edition does not silently connect to production Firebase services.
Online-only controls remain unavailable when there is no online session.

## Use another device on your network

To open the world from another computer or phone on the same trusted network,
start the server with:

```bash
npm run dev:standalone -- --host 0.0.0.0
```

Then open `http://YOUR-COMPUTER-IP:4192/app/` on the other device. Your firewall
may ask whether Node.js can accept local network connections. Live GPS normally
requires a secure browser context and may not be available over a plain local
network address; `127.0.0.1` and `localhost` are treated specially by browsers.

Do not expose this development server directly to the public internet.

## Data and licensing

Map imagery, fonts, weather, aircraft observations, and other provider-backed
features still require internet access and remain subject to their providers'
availability and terms. Required attribution remains visible in the game and is
listed in [Attribution](../ATTRIBUTION.md) and [Data sources](../DATA_SOURCES.md).

Running the project locally does not change its license. World Explorer 3D is
publicly viewable under the custom source-available terms in
[LICENSE](../LICENSE); it is not licensed as OSI open-source software.
