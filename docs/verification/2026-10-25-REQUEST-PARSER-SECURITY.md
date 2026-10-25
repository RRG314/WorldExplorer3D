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

Protected source review and staged/live deployment remain pending at this source
checkpoint. A clean dependency audit is not an absolute security guarantee or a
claim to have tested every game or backend feature again.
