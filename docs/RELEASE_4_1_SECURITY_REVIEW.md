# World Explorer 3D 4.1 Security Review

Date: 2026-07-25

Decision: conditionally accepted for the 4.1 candidate, subject to the clean
release gate and the controls below.

## Findings

- Critical advisories: 0.
- Root production audit: 5 high findings in one transitive chain.
- The affected root path is
  `firebase-admin -> @google-cloud/firestore -> google-gax -> rimraf -> glob -> minimatch -> brace-expansion`.
- The advisory is a denial-of-service risk from unbounded brace expansion.
- `npm audit fix --dry-run --omit=dev` produced no compatible dependency
  change. Earlier incompatible overrides were removed rather than shipping an
  unvalidated Firebase stack.

## Exposure Review

The affected packages are transitive Firebase/Google administration and file
cleanup dependencies. World Explorer does not pass user-controlled glob or
brace patterns to `rimraf`, `glob`, `minimatch`, or `brace-expansion`, and the
browser hosting artifact does not publish this Node dependency tree.

This reduces exploitability for the current application paths but does not
erase the advisory. Availability risk remains if a future server path begins
processing untrusted patterns through the affected chain.

## Required Controls

- Do not expose glob, brace, or filesystem cleanup patterns as public inputs.
- Keep Functions and the authoritative MMO server on supported Node 22
  runtimes with least-privilege service credentials.
- Re-run root and Functions production audits for every release candidate.
- Enforce the exact reviewed advisory set with
  `npm run test:production-audit`; a new name, direct dependency, severity
  change, missing upstream fix path, or critical finding fails the gate.
- Upgrade Firebase Admin / Firestore / Google GAX when a compatible patched
  chain is available, then rerun Functions exports, rules, MMO server, browser,
  load, and retention gates.
- Reopen this decision immediately if a critical advisory appears or an
  affected package becomes reachable from untrusted input.

## Release Gate

This review permits the known high findings under the fixed 4.1 rule that high
advisories must be resolved or explicitly reviewed. It does not permit any
critical finding, undisclosed advisory, failed security test, or incompatible
override.
