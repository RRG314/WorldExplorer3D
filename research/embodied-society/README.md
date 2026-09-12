# World Explorer embodied-agent research

**Developmental research pilot · September 11, 2026 · Not peer reviewed**

Can a language-model agent maintain itself and make useful things while acting through a body in an existing mapped 3D world? This branch investigates that question using World Explorer 3D as the environment. The present system supports one resident, finite resources, needs, designed recipes and bounded model calls. It is an experiment platform, not a demonstration of artificial human life.

Live Gemini runs have produced movement, balanced resource gathering and one observed eating event with a measured increase in food reserve. An unchanged resource-use repeat gathered but did not eat. Four focused tool probes produced no tool; the final probe reached its simulation limit without a terminal interface error. Sustained survival, useful manufacturing, construction and society remain unproven.

## Read the study

| Document | What it explains |
| --- | --- |
| [Technical report](papers/pilot-technical-report.md) | Research question, architecture, methods, findings and limitations |
| [Results](RESULTS.md) | Successful and unsuccessful developmental attempts, with evidence links |
| [Resource-use protocol](PROTOCOL.md) | Initial conditions, acceptance criteria and stopping rules |
| [Useful-tool protocol](TOOL-USE-PROTOCOL.md) | Task, required manufacturing evidence and amendments between attempts |
| [Memory comparison](MEMORY-COMPARISON.md) | Planned test of earlier stated intent alongside outcomes; not yet executed |
| [Observer guide](OBSERVER.md) | Minimize the panel, inspect inventory and download decision reports |
| [Reproduction guide](REPRODUCIBILITY.md) | Verify records and run locally with a private model configuration |
| [Data specification](DATA.md) | Record formats, missing evidence, provenance and privacy |
| [Acknowledgements](ACKNOWLEDGEMENTS.md) | Dependencies, related research and attribution |

## System at a glance

The mapped host connects the resident to accepted ground, collision and reach checks. The workshop owns inventory, finite supplies, needs and crafting jobs. A controller advances the body and records action effects. A local server sends structured observations to the model, enforces a call allowance and retains a private ledger. The observer displays that state; it does not manufacture evidence or direct the resident's choices.

The model sees structured information, not continuous camera images. It can choose among supported physical actions and supplied recipes. It cannot invent executable mechanics, edit source, browse the web or create materials by naming them. See the [technical report](papers/pilot-technical-report.md) for the boundaries between these components.

## Verify locally

With Node 22 and Python 3, from the repository root:

```sh
npm run experiment:society:test
python3 scripts/embodied-society/research-records.py check
python3 -m unittest discover -s tests/embodied-society -p 'test_*.py'
```

These checks do not start a model, a renderer or a deployment. Passing them establishes selected implementation and recordkeeping properties; it does not establish behavioral success. Follow the reproduction guide for a bounded live run.

## Scope and availability

The research branch retains the application needed to reproduce the environment. Research code is under `app/js/experiments/embodied-society/` and `scripts/embodied-society/`; the study is documented here. Production deployment configuration is excluded. Publication does not merge research into `stable` or `main`.

Thirteen heterogeneous developmental runs are retained in the reviewed inventory. They are not a statistical sample of interchangeable trials. Raw credentials, private observations and user records are withheld; this limits independent replay. The repository's source-available [license](../../LICENSE) applies. Cite the technical report and exact public commit using [CITATION.cff](../../CITATION.cff). No independent review or external endorsement is claimed.
