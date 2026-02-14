# World Explorer 3D Documentation Index

This index lists the documentation that exists in this branch today.

## Core Documents

| File | Purpose |
| --- | --- |
| `README.md` | Project overview, architecture stage, quick start pointers |
| `QUICKSTART.md` | Local run, Pages deploy, first 60 seconds |
| `USER_GUIDE.md` | End-user feature guide |
| `API_SETUP.md` | Real-estate API setup and verification |
| `TECHNICAL_DOCS.md` | Developer-level systems and implementation notes |
| `ARCHITECTURE.md` | Runtime architecture and subsystem boundaries |
| `KNOWN_ISSUES.md` | Current gaps, regressions, and contribution targets |
| `CONTRIBUTING.md` | Contribution process and PR rules |
| `CHANGELOG.md` | Version and release changes |
| `SECURITY_STORAGE_NOTICE.md` | Memory-storage behavior, security baseline, and disclaimer boilerplate |
| `ACKNOWLEDGEMENTS.md` | Third-party and first-party research attributions |
| `LICENSE` | Proprietary, all-rights-reserved source-available license |

## Recommended Reading Order

1. `README.md`
2. `QUICKSTART.md`
3. `USER_GUIDE.md`
4. `TECHNICAL_DOCS.md`
5. `KNOWN_ISSUES.md`
6. `CONTRIBUTING.md`

## Current Freeze Scope (2026-02-14)

The current branch documentation set includes updates for:

- Restored main-style location selection behavior (`Suggested` + `Custom`)
- Title launch-mode selectors (`Earth`, `Moon`, `Space`)
- Space-flight controls listed in start-menu Controls tab
- Asteroid belt + Kuiper belt visual layers
- Clickable deep-sky galaxies with inspector info
- Persistent memory markers (pin/flower + 200-char notes + remove flow)
- Memory composer `Delete All` flow with confirmation
- POI + memory marker rendering on minimap and large map overlays
- Legend checkboxes for independent memory pin/flower visibility on maps
- Brick block builder controls (`B`, click place, shift-click remove, clear current location, delete all, 100-block cap)
- Security/storage boilerplate notice for persistent memory data
- Dynamic UI text escaping in map/property/historic panels
- Cache-bust loader chain alignment through `v=31`

## Maintainer Notes

- Keep this index aligned with files that actually exist in the branch.
- If a doc is removed or renamed, update this file in the same commit.
- If a new contributor-facing doc is added, list it here.

## License Alignment

This repository is public-source-visible but proprietary.

- Code visibility: public
- Reuse rights: restricted
- License model: source-available, all rights reserved

See `LICENSE` for full terms.
