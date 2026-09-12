# Developmental results

As of September 11, 2026, the strongest observed behavior is movement followed by acquisition and consumption of a finite food item. Useful manufacturing has not been demonstrated. The retained inventory contains **12 developmental runs and 89 provider ledger events**: 86 completed, one failed and two left reserved. Provider completion does not imply an action succeeded in the world.

These attempts used different model or interface revisions. No success rate, model ranking or population inference is calculated from them. Each evidence file records the applicable source and conditions.

## Behavioral evidence

| Study / run | Recorded result | Interpretation |
| --- | --- | --- |
| Initial integration, `free-1789158460096-09fbef` | One connection probe; two resident decisions gathered one water and one snack | Model-to-workshop integration; no movement or consumption in this run |
| Resource use, `free-1789174500266-c75911` | 20 decisions; 7 moves, 12.663 m; 11 gathers; one consume; one rejected remote gather | Food inventory 8 → 7 and reserve about 0.53 → 0.83; acquisition followed by eating |
| Unchanged repeat, `free-1789176286606-8773cb` | 20 decisions; 6 moves, 11.899 m; 14 gathers yielding 8 water and 6 snacks; no consumption | The eating outcome did not repeat within the declared bound |
| Tool probe 1, `free-1789177869788-bd74aa` | Three responses; third movement used an out-of-range look control; stopped at 27.6 simulated seconds | Interface failure; empty inventory and no tool |
| Tool probe 2, `free-1789178295752-eb8e47` | 13 responses; eight snacks gathered; consume used an instance ID as a material ID; stopped at 685.8 seconds | Invalid item identification; no tool |
| Tool probe 3, `free-1789179355989-ea1ce4` | 16 responses; three moves, 6.979 m; 12 gathers yielding 8 water and 4 snacks; one remote gather rejected; 900-second limit | No terminal interface error, but no consumption, crafting or tool use |

Reviewed action-transition evidence: [resource-use success](evidence/resource-use-attempt-3.json), [unchanged repeat](evidence/resource-use-repeat-1.json), [tool probe 1](evidence/tool-use-attempt-1.json), [tool probe 2](evidence/tool-use-attempt-2.json), [tool probe 3](evidence/tool-use-attempt-3.json). The complete [run inventory](records/development-runs.json) retains earlier integration and resource-use failures, including incomplete provider accounting. The [aggregate ledger summary](records/summary.json) reports known token usage and missing usage records.

## Changes between attempts

Earlier resource-use attempts exposed inaccurate consumable descriptions and disagreement between browser and provider timing. Descriptions were aligned with actual need restoration; request spacing was measured conservatively after completion. The successful resource-use trial followed those corrections. The repeat used matching recorded source fingerprint and initial conditions, but external map inputs are not fully archived for deterministic reconstruction.

The first tool probe exposed missing numeric bounds in the model schema. The second exposed ambiguous inventory identifiers and a budget enforced by the controller but not shown to the model. The final probe received catalog identifiers, normalized control bounds, its explicit task and the remaining decision/time allowance. Its 16 pre-dispatch observations were archived. This confirms those inputs were supplied, not that the model understood them or explains why it kept gathering.

Simulation-limit cleanup also required correction: an earlier controller stopped while the observer waited for the wall timer to restore human control. Subsequent failure and limit paths restored the human view during observation. These changes are protocol amendments, not grounds for erasing failed attempts.

The later observer update adds quantity displays, a minimized panel and downloadable action reports. New Gemini calls request brief stated intent. That changes the output contract and must be recorded as a new condition in future comparisons. Historical decisions have no such explanation; none has been invented for them.

## What the evidence establishes

Balanced gathering is checked against both supply depletion and inventory increase. Consumption requires an item decrement and a corresponding needs change. The useful-tool evaluator requires gathered inputs, completed crafting with the declared duration/output, and subsequent tool-dependent acquisition with recorded tool wear. Component fixtures exercise this evaluator; they are not live manufacturing results.

One eating event establishes a working acquisition-to-consumption path. It does not establish reliable self-maintenance. Stockpiling without eating within a short bounded run does not establish inability to survive longer. Likewise, the failed tool probes do not prove impossibility; they show that the milestone has not been met under these conditions.

## Next milestone

The next behavioral requirement remains: manufacture a tool from gathered materials, then use it to obtain the tool-dependent resource. Before additional trials, freeze the revised observation/output contract and specify a comparison, stopping rule and treatment of interface failures. Inspect stated intent alongside actual transitions, without treating explanations as causal proof. Do not increase population or claim a society before single-resident capability and recordkeeping are adequate.
