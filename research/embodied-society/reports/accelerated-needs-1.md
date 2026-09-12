# Accelerated needs study: implementation and interrupted launch

September 12, 2026. The first accelerated launch did not reach resident startup. It produced **zero model calls**, no workshop checkpoint and no behavioral trajectory. The existing thirteen model runs remain the complete retained model-run inventory; this pre-dispatch interruption is recorded separately.

The setup page successfully connected the approved Free-tier Gemini configuration and displayed the six-hour accelerated window. The operator opened the mapped Baltimore world. During loading, browser inspection returned “target closed while handling command.” The browser inventory still listed the tab; this does not establish that the renderer was healthy or that a browser crash occurred. The local server remained responsive and confirmed zero calls and no saved checkpoint. No contemporaneous browser diagnostic report was found. The cause remains unresolved. The owned tab and server were closed; no automatic heavy retry was made.

## Implemented behavior

The new window targets six simulated hours in a maximum fifty-minute session. Resident physics, needs and workshop jobs advance together through unchanged fixed-size physics steps at a target 12× rate. Both a simulated-minute decision gap and five wall seconds after response settlement are required. The window allows at most 380 attempts and stops on quota/provider failure, without retry or paid fallback. Base-world weather and day/night presentation remain outside this accelerated clock.

The setup and terminal launcher offer the accelerated window first, while retaining the eight-hour real-time mode and fifteen-minute integration pilot. The server freezes the chosen timing in the manifest and exact archived model observations. The resource-use starting profile is selected for accelerated mode; the operator protocol uses General exploration and outcomes-only memory.

## Verification and limits

All **91 Node tests and 24 Python record tests pass**. The public inventory validates with thirteen model runs. New controlled tests verify equal movement/needs results with small and accelerated frame batches, checkpoint creation when batches cross a thirty-second boundary, both decision-spacing gates, model-specific Free-tier pacing restrictions and canonical server timing despite incoming overrides. HTTP provider tests use response doubles, not live Gemini requests.

The setup UI was observed in the real browser. The accelerated mapped-world trial is **not verified**. Movement remains limited to five simulated seconds per command; a persistent activity layer is absent. Shelter/rest access, renewable resources and complete restart support also remain unresolved. The next live attempt needs the world-loading interruption diagnosed first. It should use the frozen [protocol](../ACCELERATED-NEEDS-STUDY.md), retaining a new attempt identifier and any differences rather than replacing this record.

See the [machine-readable evidence](../evidence/accelerated-needs-attempt-1.json) and [design review](../RESEARCH-DESIGN-REVIEW.md). No new survival or tool-making result is claimed.
