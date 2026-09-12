# Watching a resident

The research panel follows the AI resident in the mapped world. **Minimize** reduces it to a compact status and inventory display; **Expand** restores controls. Minimizing changes only the display: it does not pause the run or reduce its remaining allowance. Use **Pause** to suspend the resident and **End run** to stop and restore the human view.

## Inventory

**Resident inventory** lists each material and the number carried. Eight water items appear as “trail water × 8,” even when stored as one stack. This inventory belongs to the research resident. The ordinary World Explorer backpack belongs to the human player and will not increase when the resident gathers.

Quantities come from the workshop's authoritative state. Gathering must remove stock from a reachable finite supply and add it to the resident. Consumption removes an item; crafting transfers inputs into a job until the resident finishes it. A selected action can be rejected without changing inventory. The last-action status explains such rejections; the report provides the before and after states.

## Decision report

After a run starts, **Download decision report** saves a Markdown document on your computer. It includes every recorded world-action attempt in the current run: action parameters, outcome, inventory changes, needs and measured movement. It remains available after the run ends. A download during an unfinished action is an interim record, not its final result.

New Gemini calls request a brief statement of intent and relevant uncertainty alongside the action. This statement is archived separately and cannot authorize any action. It is model-generated commentary, not a faithful or complete view of internal reasoning. Earlier runs did not collect these statements; their reports explicitly mark them missing. No explanation is reconstructed after the fact.

Exact pre-dispatch observations have been privately archived since the third tool probe. They include the task, budget, available resources, recipes, body state and recent outcomes. The readable report is a summary of recorded action evidence, not a complete observation archive. It cannot explain why an action without evidence was chosen, or establish consciousness, understanding or human-like motivation.

The server stores local run records under `output/embodied-society-live/<run-id>/`. Keep those raw records private. Public evidence contains reviewed summaries; downloading a report does not upload or publish it.

## Interpretation

A provider response means the model replied. A completed movement means a measured body path. A balanced gather means supply stock decreased as custody increased. A useful-tool result requires a tool made from gathered inputs and subsequently used to obtain a tool-dependent resource. These are distinct outcomes. The current live evidence has not passed the useful-tool requirement.
