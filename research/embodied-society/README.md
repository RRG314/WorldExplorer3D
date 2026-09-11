# World Explorer embodied-agent research

**Release: research pilot 0.1 — September 11, 2026. Not peer reviewed.**

This branch investigates whether a language-model agent can use a body, finite resources and useful constructions in an existing mapped 3D world. The software currently supports one bounded resident. The only successful live behavioral result is two gathering actions selected by Gemini. Sustained survival, open-ended invention and society remain research questions.

The application is the environment dependency; the research program is under this directory, its browser adapter is under `app/js/experiments/embodied-society/`, and its local model server is under `scripts/embodied-society/`. No production deployment is part of this branch. The public research snapshot deliberately omits private development history and deployment workflows. It retains the existing application source because the resident uses actual game physics and inventory, not a substitute simulation.

## Start with the evidence

- [Technical paper: architecture, methods and pilot findings](papers/pilot-technical-report.md) explains the implemented experiment, its relation to prior work and the narrow supported result.
- [Research protocol and next acceptance study](PROTOCOL.md) defines questions, outcomes, stopping rules, intervention handling and comparisons before further runs.
- [Data and reproducibility specification](DATA.md) defines private versus public records, field meanings, validation, missing evidence and recovery limits.
- [Results and failure record](RESULTS.md) separates provider success from applied actions and preserves failed attempts.
- [Execution and reproduction guide](REPRODUCIBILITY.md) explains how to verify the records and start the real pilot without production access.
- [Research governance and milestones](GOVERNANCE.md) explains review, change control, safety and the gate to each next capability.
- [Acknowledgements and annotated references](ACKNOWLEDGEMENTS.md) identifies actual dependencies and intellectual context without implying endorsement.

## Verify without running an AI model

From the repository root, with Node 22 and Python 3 available:

```sh
npm run experiment:society:test
python3 scripts/embodied-society/research-records.py check
python3 -m unittest discover -s tests/embodied-society -p 'test_research_records.py'
```

These are bounded tests and data validation, not a live survival demonstration. They do not start WebGL, contact Gemini or deploy services. See the reproduction guide for the distinct live procedure. The current license is source-available, not an unrestricted open-source or dataset license; see the repository LICENSE and attribution records.

## Current result

The September 11 successful pilot had three provider responses: one connection probe and two resident decisions. The resident gathered one water and one snack. Pause and Resume were observed, and End restored the human view. Five locally retained development runs are inventoried, including unsuccessful attempts; they are not five equivalent trials. No confirmatory experiment or statistical comparison has been completed.

Please cite the technical report as a versioned software technical report, not a peer-reviewed paper. Root `CITATION.cff` and `references.bib` provide citation metadata. Cite the exact public Git commit used in any reproduction.
