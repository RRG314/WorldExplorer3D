# Request-parser security patch — October 25, 2026

A new GitHub/ npm advisory surfaced while publishing the mobile controls update:
[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828),
CVE-2026-111181. The Functions lockfile selected body-parser 1.20.6, below the
maintainer's fixed 1.20.9. This is a server process-availability issue involving
compressed HTTP bodies, not evidence of a breach or a PHP dependency.

Scope: update this one compatible transitive package in the existing Functions
lockfile. Preserve all function code, configuration, IAM, Auth, rules, Hosting,
player data, native package and the separately released mobile controls. No
malformed-request probe is sent to a live service. Existing security authorization
covers this identified repair; no game-wide acceptance sweep is restarted.

## Source and controlled evidence

Evidence directory: `output/research/request-parser-security-2026-10-25/`.

- The first isolated loopback request used a closed connection and did not
  reproduce the crash. That non-reproduction is retained.
- The corrected keep-alive request with a delayed invalid gzip suffix terminates
  the old 1.20.6 child process with an unhandled Gunzip `Z_DATA_ERROR`. This is an
  isolated owned Node HTTP server; no production or staging attack was attempted.
- Upgrade body-parser 1.20.6 → 1.20.9. No other installed dependency changes;
  its declared qs range updates to the version already enforced by this project.
- Four focused cases pass: installed fixed version, valid gzip JSON, the same
  delayed suffix with follow-up server health, and unsupported-charset rejection.
  Each child is deadline-bounded and owns only a loopback listener.
- npm production-dependency audit changes from one high finding to zero findings.
- The first global Cloud Functions inventory request returned 503. The explicit
  existing us-central1 region returns all 84 functions ACTIVE. Retain the failed
  request; regional source/configuration/IAM/rollback snapshots precede updates.

At the initial source checkpoint, protected review and staged/live deployment
were pending; the completed delivery is recorded below. A clean dependency audit is not an absolute security guarantee or a
claim to have tested every game or backend feature again.

## Review and deployment preparation follow-up

Initial protected checks rejected the missing dependency-inventory hash update
and an unsafe echo in the test-only loopback fixture. The reviewed lock hash is
updated, and the fixture now returns a fixed JSON boolean with explicit JSON
content type and nosniff. No suppression or security-policy bypass was added.
The source-package verification also caught reused mutable ZIP metadata before
any upload/update; a copied ZipInfo preserves all original offsets. Original
failed results and the failed generated private archive remain retained.

All 84 existing Functions in each project have configuration/IAM/source recovery
snapshots. Staging contains four active source versions and production five.
Each existing source archive receives only the reviewed body-parser lock entry;
its existing root dependencies (including older versions without Svix), every
other package and every other archived file are preserved. The existing qs
6.16.0 satisfies the fixed parser requirement. This avoids promoting unrelated
newer business code to functions deliberately left at older source versions.
The first staging public-stats update preceded the broader rollout recorded below.

The owner additionally requires normal phone-browser control coverage. Add
explicit mobile-web verification across browser engines and the Safari user-gesture
permission path; keep physical-device claims separate. Game bytes remain the
qualified source 52d5f24 unless a demonstrated browser defect requires a repair.

## Completed delivery

Protected PR132 passed all required checks and merged normally as
`249fa2b6655d640fbbb2820476246d564e487dbb`, from head
`fa09fdb39981f29ed87c81b1f77addaf2e4f4c67`. Reviewed and merged trees match.
GitHub marks Dependabot alert 1 fixed. Source production-dependency audit has
zero findings; this is an identified dependency repair, not a promise of
absolute security.

All 84 existing staging Functions and all 84 production Functions are updated
and ACTIVE. Every immutable Function configuration and IAM policy is preserved;
Auth, project IAM, Firestore rules and Hosting are unchanged. Every updated
version ID changed. Downloads from representatives of all four staging and five
production source groups match the exact reviewed patched-archive hashes.
Each upload preserves all archived files other than package-lock.json, and only
the body-parser package entry changes within that lockfile. Original source and
configuration recovery remain private and owner-readable only.

The staging audit started before the final operation finished and correctly
rejected its unchanged version; the final audit after all operations finished
passes. A queued production build for claimExplorerDiscovery was cancelled with
resource-exhaustion code 8. Only that service was retried. Its first resubmission
rejected the now-expired signed upload URL with code 3, before a build started.
The exact previously qualified archive was rehashed and reuploaded under a fresh
URL, then the single service completed. The other 83 successful updates were
retained, and both failed operation records/logs are preserved. No whole rollout,
world test matrix or game build was restarted.

Production's final normal HTTP checks return public stats GET 200, stats POST
405 and unauthenticated joinRoom 401. Staging's equivalent checks pass. These
are normal reads/admission rejection; no account, player data, email or payment
mutation is part of this verification. The isolated gzip reproducer never ran
against either live project.

Primary receipts in the evidence directory:

- protected-release.json: reviewed head, merge, required checks and tree parity.
- staging-preservation.json and production-preservation.json: final ownership,
  configuration/IAM, version and representative live archive checks.
- staging-prepared.json and production-prepared.json: exact archive/lock hashes
  and preserved-file proofs, with no private source contents or signed URLs.
- production-operations.json and production-retry*.json: original failures,
  narrowly resumed update and final ownership trail.
- staging-http-after.json and production-http-after.json: expected HTTP behavior.

The separately released vehicle game bytes and native version 4 stay unchanged.
Ordinary mobile-browser coverage is recorded in the mobile-web verification
record; it does not require another Hosting or Play build.
