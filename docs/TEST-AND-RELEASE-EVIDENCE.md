# What the verification results mean

The component test count is not a count of working features, browser journeys,
or production checks. `verify:current-contracts` runs an explicit list of Node
test files. Some execute application logic or Three.js geometry; some inspect
source wiring; others use controlled service fixtures. Browser and emulator
journeys have separate gates.

## Inspect the evidence

- `npm run verify:pr`: source and release-script syntax/coherence, component
  checks, test inventory, and the targeted cleanup mutation experiment.
- `npm run audit:tests`: lists selected and excluded test files with static
  signals. Reading a file does not necessarily make a test source-only; these
  signals are not coverage percentages or mutually exclusive categories.
- `npm run verify:test-sensitivity`: temporarily disables building-detail
  cleanup through a child-process module loader. The source-text checks must
  still pass and the runtime lifecycle check must fail. The actual source and
  artifact are never modified. This proves sensitivity to one named defect,
  not a whole-suite mutation score.
- `output/verification/current-contracts/report.json`: actual executed cases,
  names, files, results, and Node's completed-run totals. A new run removes the
  old report first. Skipped or TODO cases cannot yield a complete passing gate.
- `output/verification/current-contracts/inventory.json` and `sensitivity.json`:
  the corresponding inventory and mutation receipts. PR CI preserves all three
  reports as the `component-test-evidence` artifact, including on failures.

On September 23, the original 1,222 cases came from 252 unique files. The
inventory audit found 12 relevant existing component files (58 cases) omitted
from that list, plus room-profile emulator tests omitted from the backend path.
They are now assigned to the appropriate gates. The inventory fails if any test
file is unassigned; six browser/emulator test files intentionally remain outside
the Node component command. Promotion guards, gate-scope rejection, and runtime
cleanup checks were added as well. Consult the executed report for current totals.

Four source-text facade checks passed with cleanup disabled; the new runtime test
detected the retained scene objects. More passing cases alone would not have
established that difference.

## Release path

1. Freeze clean source and build a staging-configured artifact. Run the complete
   candidate and backend matrices against it. Record artifact identities and
   source identity; preserve failures and distinguish remote functional results
   from actual device performance.
2. `node scripts/prepare-production-artifact.mjs` requires the complete current
   readiness and public-claim checks before replacing that artifact. It builds
   the production configuration and validates that every other packaged asset
   is byte-identical to the tested staging package. Only the three generated
   Firebase configuration assets may differ, and their contents must match the
   respective checked-in configuration. The receipt retains both manifest
   identities and source identity.
3. Finalization rechecks actual production asset bytes, clean source, the
   promotion receipt, complete linked staging evidence, and real owner-reviewed
   acceptance metadata. Production Firebase remains forbidden on localhost;
   finalization does not pretend a local production journey passed.
4. A production `preview:deploy` requires the existing prepared artifact and
   finalization even with `--skip-checks`. The selected project and environment
   must match the package. `preview:promote` always invokes finalization, checks that preview manifests
   match the approved local package, and clones the specific immutable Hosting
   version. A channel that moves during verification is rejected. It cannot
   silently skip readiness by cloning an arbitrary preview directly to live.

No approval file or passing execution receipt should be manufactured to get
past a gate. A subset of passing gates does not replace a complete matrix.
Requesting a backend gate under candidate scope is now an error, not a silently
omitted check. Human phone acceptance and sustained device performance remain
separate from component and remote browser evidence.
