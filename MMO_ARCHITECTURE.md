# Persistent Sandbox MMO Architecture

World Explorer 3D uses real geographic and astronomical data as an immutable
foundation. Multiplayer rooms are alternate, persistent versions of that
foundation. A room never edits OpenStreetMap, terrain, imagery, or astronomy
source data.

## Product Contract

The platform is a persistent geospatial sandbox:

`base world + room patches + active session state = playable room`

- **Base world** is read-only mapped or catalog data with source provenance.
- **Room patches** are durable, revisioned changes such as hidden source
  structures, placed objects, room rules, vehicles, activities, and terrain
  operations.
- **Session state** is authoritative transient simulation state such as players,
  occupied vehicles, projectiles, NPCs, active encounters, and temporary damage.

Earth, Moon, Mars, space, and creator-owned worlds use the same room contract.
Their coordinate frames differ, but permissions, budgets, revisions, and
simulation messages do not.

## Authority Boundary

The browser predicts local movement and renders the world. It does not authorize
durable changes, inventory, rewards, combat results, ownership, or progression.

The authoritative room service:

1. verifies a Firebase ID token;
2. loads membership, role, room rules, and the current room revision;
3. validates every command against capabilities, quotas, rate limits, bounds,
   expected revision, and idempotency key;
4. advances dynamic state on a fixed simulation tick;
5. synchronizes only relevant nearby state to each client;
6. persists accepted room patches and periodic recovery snapshots;
7. writes an append-only audit record for moderation and rollback.

Existing Firebase user documents and authentication remain valid. The current
direct-Firestore multiplayer path stays available only during migration and is
removed after the authoritative client passes compatibility tests.

## Room Sharding

Durable patches are indexed by room and geographic cell. Earth uses Web Mercator
cells. Planetary surfaces use body-relative metric cells. Deep space uses nested
sectors. Clients subscribe to the current cell plus a bounded interest radius.

This prevents a rebuilt Baltimore room from loading every modification on Earth,
and lets a room grow without turning one Firestore document into a global state
blob.

## Roles And Capabilities

- **Owner**: room lifecycle, roles, rules, building, moderation, and rollback.
- **Administrator**: moderation, rules, building, activities, and vehicles.
- **Builder**: approved construction, demolition, object placement, and editing.
- **Player**: movement, vehicles, interactions, combat, activities, and chat.
- **Visitor**: movement, public interactions, and chat where enabled.

Capabilities are checked by the server for each command. UI visibility is not a
security boundary.

## Creator Resources

Creator content is data, not arbitrary uploaded JavaScript. A versioned resource
manifest can declare maps, spawn points, teams, objectives, NPC templates,
weather, time, rewards, and constrained trigger/action graphs. The server
validates the manifest and executes allowlisted actions. Unsafe browser or server
code is never loaded from a room document.

## Game Platform Contract

Progression is account-owned and server-authoritative. Rooms may select approved
mission and activity definitions, but cannot mint arbitrary experience, credits,
inventory, or leaderboard records. The first platform progression contract
includes exploration distance, vehicle distance, construction, mission
completion, combat eliminations, deaths, experience, level, and earned credits.

Weapons are catalog data with a server-owned category, range, damage, cooldown,
and projectile behavior. The browser may request an attack and render predicted
feedback; the room service owns cooldowns, origin, range, line-of-fire checks,
damage, eliminations, respawns, rewards, and replicated projectile state. Room
rules can disable combat completely.

Mission progress is derived from accepted authoritative events. Movement comes
from the fixed simulation, construction comes from accepted durable commands,
and combat comes from validated hits. A client cannot submit a score, distance,
kill, reward, or completed mission directly.

Leaderboards are read models built from server-owned profiles. They never reuse
the current client-written challenge collections as MMO authority. Existing
single-player and legacy multiplayer games remain presentation/gameplay plugins
until each one has a reviewed adapter that reports verifiable events.

## Persistence

Firestore remains the initial durable store for room metadata, patches,
revisions, inventories, progression, and audit events. The realtime room service
uses WebSockets and a fixed tick; Firestore is not used as a high-frequency
movement bus. Store interfaces remain portable so self-hosters can add PostgreSQL
without changing game rules.

## Performance Budgets

Budgets are explicit data and apply per room, cell, actor, and client interest
set. They cover players, persistent objects, dynamic bodies, vehicles, NPCs,
projectiles, lights, scripts, message size, command rate, and snapshot frequency.
Distance LOD, sleeping, pooled effects, instancing, and interest management are
required runtime behavior rather than optional polish.

## Deployment Shape

- Firebase Hosting: static browser client.
- Firebase Auth: identity and existing account continuity.
- Firestore: durable records and migrations.
- Authoritative Node room service: Colyseus WebSocket rooms, initially deployable
  to Cloud Run and self-hostable with the repository.
- External coordination: required before horizontal room-server scaling; one
  room must never be independently simulated by two instances.

Cloud Run WebSockets have bounded request lifetimes, so reconnect/resume and
periodic recovery snapshots are mandatory. Production scaling is gated on an
external presence/driver configuration and multi-instance tests.

## Release Gates

The MMO branch is not production-eligible until all of these pass:

- migration preserves current users, rooms, blocks, artifacts, and activities;
- unauthorized durable writes and replayed commands are rejected;
- two or more clients see matching movement, vehicles, building, combat, and
  progression through reconnects;
- room rollback restores a prior revision without changing the base world;
- load, soak, network impairment, mobile, memory, and visual tests meet budgets;
- public contribution, moderation, security, data-source, asset-license, and
  self-hosting documentation are complete;
- distribution checks confirm Apache-2.0 code licensing, third-party
  provenance, data attribution, DCO sign-off policy, and secret-free artifacts.

## Reference Lessons

- Colyseus supplies authoritative rooms, state synchronization, matchmaking,
  reconnection, load testing, and self-hosting rather than a custom socket layer.
- Multi Theft Auto separates reusable game modes, maps, client presentation, and
  server authority through resources and events.
- OpenSimulator separates regions from grid services and uses extension modules.
- World of ClaudeCraft demonstrates one deterministic game core across offline,
  authoritative multiplayer, and headless testing, plus content progression and
  contribution workflows.

These are architectural references only. Their code and assets are not copied.
