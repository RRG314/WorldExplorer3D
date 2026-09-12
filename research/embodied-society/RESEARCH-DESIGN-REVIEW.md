# Research design review: duration, action opportunities and autonomous life

September 12, 2026. This review revises the next study; it does not reinterpret unsuccessful historical trials as successes.

## The short window was inadequate for needs pressure

One workshop tick is one simulated second. Water falls by 1/14,400 per second; food and rest by 1/28,800. These are game rules, not physiological measurements.

| Quantity | Loss in 900 seconds | Time to zero from the resource-use starting value, without restoration |
| --- | --- | --- |
| Water, initially 45% | 6.25 percentage points | 108 minutes |
| Food, initially 55% | 3.125 percentage points | 264 minutes |
| Rest, initially 90% | 3.125 percentage points | 432 minutes |

A fifteen-minute trial can test integration or a supplied task. It cannot meaningfully establish sustained self-maintenance under these rates. Stockpiling in that window is not evidence that a resident will never consume when reserves become low. Earlier results remain valid descriptions of those bounded attempts; their implications must remain narrow.

The research setup now offers an **eight-simulated-hour needs observation**, capped at ten wall hours and 600 provider decisions. The existing fifteen-minute integration window remains available. This real-time option preserves the original clock rate. Actual simulated time may lag wall time while a model request is pending, while paused, when the browser is throttled or when rendering/storage is slow. The run stops at whichever declared bound or failure occurs first. Six hundred calls is an allowance ceiling, not a guarantee of provider Free-tier quota.

## Duration was not the only limiting factor

**Action opportunities.** Movement requests are limited to five simulated seconds, while the original Free-tier calls were spaced by at least a wall minute. The accelerated window now permits five wall seconds between settled calls and requires one simulated minute between decisions; it preserves the nominal opportunities per simulated hour. The body then waits. This is sparse action selection, not continuous autonomous activity. Making the world clock faster without changing that contract would leave even fewer opportunities per simulated hour. A future activity layer should support model-selected, interruptible activities with collision checks, outcome feedback and explicit budgets. It must not install a hidden script that performs the desired crafting sequence. That activity layer is not implemented in this update.

**Observation work and recording.** The previous controller copied the full workshop history in frequent state checks. The HUD also requested the resident's expensive geometric perception, and copied workshop state again for individual supply markers. These paths now use history-free state views, skip perception for display-only refreshes, and share one marker state read. The long window checkpoints idle needs every 30 simulated seconds, with an exact clock update before a model decision, pause or normal end. Actions still persist before publication. Its journal allowance covers periodic clock events, pre-decision clock updates and material actions. Snapshot sizes remain bounded and storage failures stop the run. These changes reduce avoidable work; they do not establish an eight-hour hardware endurance result.

**Assigned goals versus autonomous life.** “Make a tool to obtain timber” is a valid capability probe. It tests an assigned task over known recipes. It does not test whether a resident develops its own priorities or invents processes. A needs observation should use the existing General exploration contract, with its general self-maintenance instruction, and record what the resident chooses. Keep the tool probe separate.

**Environment.** The current experiment uses finite operator-placed supplies and a permitted plot, not a functioning ecosystem or unrestricted mapped-world economy. The crafting transformations are designed recipes. Exhausting a pile or following a recipe cannot establish open-ended invention. Later studies need explicit resource renewal, discovery and environmental accessibility rules rather than claims that those systems already exist.

**Rest and health.** The mapped host does not currently supply verified shelter, so the supported rest action lacks a usable shelter in this environment. Rest depletion also does not itself drive the current deprivation-damage rule, which uses water and food. A nonzero health value therefore cannot establish that all needs were maintained. Rest/shelter must be implemented and tested before a complete self-maintenance claim.

**Continuity.** There is no complete restart/replay path. Pausing, a lost model request, tab closure or quota exhaustion must remain visible in the record. A long trial is not yet an unattended durable life service.

## Revised next study

The previous two-arm memory comparison is deferred, not silently extended. Its old limits would answer a different question. The owner selected accelerated simulation first and real-time observation later. The six-hour accelerated protocol is specified in [ACCELERATED-NEEDS-STUDY.md](ACCELERATED-NEEDS-STUDY.md). Do not compare those policies as interchangeable trials.

For a real-time needs observation, the implemented `needs-8h` window provides sufficient elapsed time for all initial reserves to become low. Before dispatch, freeze the source, initial needs, finite supplies, memory condition, general-exploration contract, clock/checkpoint interval and call/wall allowances. Record every consumption, rejected action, interruption and available reserve sample. Report reserve minima, restoration events, intervals of deprivation where supported by records, and ending reason. Do not use “still alive at the end” as the sole success criterion.

The long mode is implemented and component tested. No eight-hour live AI run or benefit from memory feedback has been established. The owner's concerns about other aspects of the approach should inform the next prospective protocol before that study is launched.

## First longer trajectory

The [84-minute accelerated trial](reports/accelerated-needs-2.md) reached materially lower water reserves but produced no replenishment or crafting. It exposed an ordinary invalid gather treated as terminal, now repaired and regression tested. Navigation also needs a calibrated interface review: accumulated yaw and unspecified turning rate made the control contract unnecessarily difficult to interpret. This is a design concern supported by source inspection, not proof of why the model wandered. Preserve the original failed trajectory and declare interface changes before another trial.
