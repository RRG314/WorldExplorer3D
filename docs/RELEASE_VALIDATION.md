# Release evidence and performance measurements

Use `config/performance-budgets.json` for the numeric limits. Use current,
traceable build and service identities when reporting a release. Historical
diagnostics and operator approval records are retained privately, not published
as product source or substituted for a current release result.

Live frame timing uses ordinary browser behavior. Do not force collection,
replace native constructors, omit intervals or round away failed measurements.
The desktop floor is 30 FPS, with p95 at most 35 ms and p99 at most 50 ms.
Independent hitch constraints remain 250 ms maximum pause, at most one interval
over 100 ms per minute and at least ten seconds between hitches.

The 1 GiB memory criterion measures retained JavaScript data while the actual
scene remains occupied, separately after all live timing windows. Report raw
used heap as well. This is not a total browser/GPU memory ceiling or physical
phone memory, thermal or battery acceptance. Missing or failed measurements
cannot count as passing.

Transfer limits apply to each defined cold load, bounded travel sequence,
reload and finalization phase. Preserve whole-session cumulative totals and
reconcile all nonnegative phase differences exactly. Do not exclude a provider,
discard trailing responses or relabel an earlier aggregate failure as success.

Software mobile emulation is a regression proxy. Physical iPhone/Android
memory, thermal and resume checks and independent new-player acceptance remain
unverified unless identified current evidence establishes them. A working
source feature, controlled test or store upload does not establish those checks.

Choose verification proportionate to a change, as described in
[Contributing](../CONTRIBUTING.md). Preserve prior applicable results, failed
evidence, assets, saves and rollback packages. Keep raw evidence and private
operator records outside the public repository.
