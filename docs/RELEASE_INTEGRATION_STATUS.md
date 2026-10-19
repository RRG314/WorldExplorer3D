# Release status

Updated October 18, 2026. **5.5.1 is live; 5.6.1 is entering final acceptance.**
The owner has authorized publication. Production, the default branch and release
must use the tested candidate; failed or missing checks are not passes.

The public overview is [5.6.1 release notes](../RELEASE_NOTES_5.6.1.md).
[Known limitations](../KNOWN_ISSUES.md) describe the product's scope.
Exact deployed identities are in [release source identities](RELEASE_SOURCE_OF_TRUTH.md).

## Current verification

All 2,729 source tests and the structural checks pass. The current native journey
passes short ground movement, 90-second flight and a four-minute walking window,
including a real street-detail handover. Retained JavaScript memory is about
29 MB lower after compacting the derived frontage index. Buildings, roads and
terrain coverage remain intact; no browser errors or gameplay interruptions occur.
This is focused source evidence, not complete immutable release acceptance.

Complete performance, backend, save/fallback roundtrip, candidate and hosted
checks still need the new frozen package. Previous failed package receipts remain
failed. The b21 package remains a modern-save-compatible emergency fallback with
known performance limitations; actual production 5.5.1 is the upgrade starting point.

The owner's earlier Android feedback retains its original scope. Emulated touch
checks are not physical-device, battery or thermal measurements. Deferred manual
coverage remains explicit in the release evidence.

## Release behavior

Earth starts in location-based mode. Optional moving scenery does not claim
worldwide physical-road or activity streaming. Travel recovery stays local,
without forcing Main Menu or a world reload. This release retains the museums,
aquarium, research vessel, space, harbor, launch-site and consolidation work.

Public gallery images and feature notes are prepared. Final publication must
preserve existing history and player progress and identify the deployed build.
