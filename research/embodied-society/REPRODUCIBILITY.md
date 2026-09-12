# Reproduction and execution

## Offline verification

Use the exact research commit, Node 22 and Python 3. From the repository root run the three commands in the research README. The research tests use native Node facilities and the existing source; they do not need a model key or a cloud deployment. The Python checker validates record structure and re-derives the summary, and its negative tests check rejection of injected private fields and malformed counts.

The public package is a privacy-reviewed snapshot with its own history. The original development checkpoint identifies provenance but is not promised as publicly reachable. The bundled app is the environment dependency; do not substitute a different production checkout and assume equivalent behavior. No hosting build or Firebase deployment is required for the local pilot.

## Live pilot

Run `npm run experiment:society` from the repository root. Open `http://127.0.0.1:4498/research-setup` locally. Enter a key privately from the intended provider project, verify its tier, and optionally run the connection check. Open World Explorer from that page, select a destination, wait for actual world readiness, then start the resident. Use Pause/Resume/End and stop the local server afterward. The server does not retain the entered key across shutdown.

A fresh key/account setup is the operator's responsibility. Free-tier eligibility, quota and model availability may change; the local zero-dollar profile cannot enforce provider billing. The launch is not a background unattended service. Map/network access is required and variable. A previous Baltimore load took roughly 83 seconds; that observation is not a timeout guarantee.

Before a prospective run, complete PROTOCOL.md's manifest and verify its wall limit is enforced or explicitly observed. Do not leave a model experiment running to satisfy a requested result. Current UI/schema/model source can change decisions; report those changes. Preserve failed attempts as well as successful ones.

## Export a private run inventory

```sh
python3 scripts/embodied-society/research-records.py export output/embodied-society-live research/embodied-society/records
python3 scripts/embodied-society/research-records.py check
```

Export operates only on direct `free-*` run directories and selected snapshot filenames. Inspect the resulting diff before publishing; exporting again may include newer runs. Unknown/free-text keys are never copied. The checker fails if the summary drifts or unrecognized fields enter records. Raw files remain private.

## Reproducibility limits

Re-running source is possible; exact replay of the recorded pilot is not established. The provider model may change, model sampling is not pinned, all world inputs are not archived, full raw evidence is withheld and no restart importer exists. Report “attempted reproduction” with these deviations, not an exact replication. Code tests passing does not reproduce the behavioral result.

## Observe and export

In the mapped world, use the AI resident panel's **Minimize** and **Expand** controls. Resident item quantities remain visible when minimized. **Download decision report** exports the current run's recorded actions and effects as Markdown; download again after termination for final action states. See [the observer guide](OBSERVER.md) for ownership distinctions, stated-intent limits and interpretation. Keep exports private until reviewed for publication.

For a lightweight observer-only browser check, with the repository's Playwright dependency and Chromium installed, run `node tests/embodied-society/observer-browser.mjs` from the root. It starts one temporary local fixture, checks quantities and minimize/expand at desktop and phone widths, saves screenshots under `output/verification/research-observer/`, then closes its browser and server. Its inventory changes are test inputs; it does not run a model, simulate a resident or establish live capability.
