# Release status

Updated October 14, 2026. **5.5.1 is live; 5.6.1 is being verified.** Production,
the default branch and the next release must be promoted together after the
remaining checks. The owner has authorized publication; authorization does not
turn missing or failed checks into passes.

The public overview is [5.6.1 release notes](../RELEASE_NOTES_5.6.1.md).
[Known limitations](../KNOWN_ISSUES.md) describe the product's actual scope.
Exact package identities are in [release source identities](RELEASE_SOURCE_OF_TRUTH.md).

## Remaining acceptance

The complete 376 matrix finished 101/107. The six failed gates concerned a disk
preflight, scene resource ceilings, two Monaco road assemblies, sustained desktop
performance, and an optional location-label provider rejection in an otherwise
completed tutorial journey. Each failed receipt is preserved; none is relabeled.

The b21 repair closes Monaco's audited road gaps and approach-grade violations.
The Baltimore junction passes real keyboard approach, turn and departure without
a world reload. Its screenshot was inspected. All 2,618 source checks pass.
Performance and resource measurements are in progress; the final complete matrix
must run against the final package.

The 376 backend matrix passed. Six changed Functions are deployed to staging,
with the existing runtime configuration preserved. Live account checks confirm
purchase retry/idempotency, private layout save/reload, three photo uploads,
CPU submission and continued editing. Temporary users and uploads were removed.
Ordinary hosted room/voyage controls, the actual release/save/fallback roundtrip,
final free-data evidence, production fallback packaging and exact reviewed images
remain required before promotion. Production backend publication is coordinated
with the new frontend.

The owner previously reported a working Android test. That feedback is retained
with its original scope; it is not a physical-device measurement for this newer
package. Any deferred manual checks must remain explicit.

## Release behavior

Earth starts in location-based mode. Optional moving scenery does not claim
worldwide physical-road or activity streaming. Travel recovery must remain local,
without forcing Main Menu or a world reload. The candidate retains the museums,
aquarium, research vessel, space, harbor, launch-site and consolidation work.

Current public gallery images and release notes are prepared. Final branch,
release and project-page publication must use the same reviewed source and
package, preserving existing history and player progress.
