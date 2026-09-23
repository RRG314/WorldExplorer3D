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

## Performance authority and remote execution

`verify:performance-retention` checks the actual host before opening a browser:
macOS, native ARM, Macmini9,1, Apple M1, 8 GiB, and no CI runner. It also requires
an M1 hardware WebGL renderer and records the host, renderer, and browser version
with the measurements. Shader, driver, and context-loss console errors also
invalidate the performance result; JavaScript exceptions alone are insufficient.
Passing host eligibility alone is not a performance pass.
`release:verify` performs the same host preflight before starting its full matrix.

The remote workflow offers explicit candidate/diagnostic gate selections and the
complete backend gate. It rejects the physical performance gate. The old separate
functional matrix was removed because it duplicated the gate registry and had
omitted new gates; cloud runs no longer offer a misleading full physical-release
mode. Select remote gates from `config/system-release-gates.json` and retain their
individual scope and artifact identities.

The source gate no longer treats screenshots in ignored audit directories as
stale application artwork. Generated evidence is outside the Hosting source
allowlist; source references, module identities, and immutable packaged assets
remain checked. Failed-run screenshots must be preserved, not deleted to make
source verification pass.

## Mobile loading measurement authority

`mobile-load` proves mapped-world publication, the mobile resource profile, and
GPS watch activation in touch emulation. It records raw startup times and provider
failures, but its functional cloud receipt explicitly does not accept performance.
The required `performance` gate runs the sustained retention check, then the same
normal/GPS mobile journeys with `--measure-load-time`. That mode rejects CI and
non-M1 hardware before browser startup, checks the actual gameplay renderer, and
enforces the single mobile load budget in `config/performance-budgets.json`.

The former script-local 38/40-second limits conflicted with the declared 60-second
M1 budget and were applied on virtual runners without matching hardware authority.
Historical failures under those limits remain failures in their original receipts.
The physical budget is unchanged, and no cloud pass replaces it or phone acceptance.


## GPS input and complete mobile journeys

CDP geolocation overrides emit individual fixes; they do not simulate an ongoing
phone GPS watch. The field-observation verifier supplies fresh fixes until the
selected target actually reveals, retaining the same bounded 30-second wait.
It never assigns field progress or bypasses the application's stale-signal rules.

The full mobile-controls functional gate has a 30-minute overall deadline on the
verification runner. Once touch holds advanced the complete requested simulation
duration, the Linux software-renderer run reached drone mode without context loss
in captured snapshots but exhausted the 15-minute overall deadline. Every simulated
frame still executes the real rendering path; a short simulated hold can therefore
take much longer in wall time on this runner. Each touch action now retains its
simulation receipt and elapsed wall time, even if a later stage times out.
Movement thresholds and per-action deadlines are unchanged. This overall allowance
is not a mobile latency/FPS budget or a physical-performance acceptance result.
