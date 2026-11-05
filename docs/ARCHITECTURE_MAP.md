# Architecture

World Explorer 3D combines a browser game, public/account pages, native companion
apps and protected shared services. The browser owns rendering and active
simulation. Backend commands and security rules own protected shared changes.

## Entry points

| Source | Responsibility |
| --- | --- |
| `index.html`, `about/` | Public site, installation and support |
| `app/index.html`, `app/js/app-entry.js` | Game startup and destination selection |
| `app/js/runtime/` | Runtime ownership, lifecycle and scheduling |
| `app/js/engine/` | Renderer, scene and movement integration |
| `account/`, `js/auth-ui.js` | Account, access and contribution UI |
| `functions/` | Authenticated commands, account saves and shared data services |
| `services/racing/` | Racing service and shared race rules |
| `android/`, `apple/` | Native app projects and platform integrations |

## World and feature ownership

Earth, Ocean and Space use the existing scene lifecycle. Terrain, roads,
buildings, interiors, vehicles and activities publish through their designated
owners. Feature UI calls those owners rather than adding another render loop,
save store, wallet or input controller. Features must release their listeners,
models, workers and collision registrations when leaving a world.

The [system guide](SYSTEM_INVENTORY.md) maps the main feature areas. Context
writes are registered in `config/context-write-allowlist.json`; verification checks
that registry and the module graph.

## Persistence and services

Guest progress stays on the device. Signed-in personal journeys use the existing
Journal and equipment owners with a private account backup and explicit conflict
recovery. Shared rooms, property, vehicles and competitive results retain their
own authoritative services. Authentication upgrades preserve the account UID.

Firebase Authentication and App Check protect service requests. Firestore and
Storage rules enforce direct-client access. Private media is delivered only
through authorized access paths. Public Firebase client configuration does not
grant access to account data.

## Packaging and deployment

Canonical source is built by `scripts/hosting-artifact.mjs` into ignored `dist/`.
The artifact records its source identity, environment, file hashes and runtime
generations. Staging and production use separate Firebase configurations.
Production promotion verifies the reviewed package rather than rebuilding it at
deploy time. Rollback generations are retained for already-open sessions.

Dependencies and native SDKs are locked. CI verifies source imports, ownership,
types, component contracts, secrets and public repository boundaries. See
[Contributing](../CONTRIBUTING.md) and [environment isolation](DEVELOPMENT_ENVIRONMENT_ISOLATION.md).
