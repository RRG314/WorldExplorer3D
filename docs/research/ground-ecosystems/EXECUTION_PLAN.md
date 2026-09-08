# Ground ecosystem execution plan

Work on steven/building-exteriors-local. No production deployment before user acceptance.
The existing terrain, road, water, building and collision authorities remain owners.

1. [ ] Reproduce the reported floating skyline with exact build/provider evidence;
   identify introduction and verify a general correction. Separate rejected-part
   loader defect is fixed, but the screenshot remains unresolved.
2. [ ] Numeric land-cover delivery: fixed versioned tiles, bounded range reads,
   cached browser-safe delivery, explicit lower-confidence fallback, cancellation
   and recovery. Numeric browser delivery implemented and regionally observed;
   full cache/failure/recovery acceptance remains open. Direct browser COG was rejected.
3. [x] Stable environmental context: local cover rather than completion-order
   aggregate; distinguish trees from crops/moss/grass; include elevation without
   labeling a small snowy mountain patch as an entire polar region.
4. [ ] Ground material integration: class-specific detail and blending, no height
   changes; near/far and slopes checked against the same accepted surface.
5. [ ] Vegetation: stable spatial identities, accepted placement limits, valid
   crown locations, regional forms/assets, bounded culling/LOD and shared trunk
   collision. Curated models replace old procedural trees. Actual BMW contact,
   reversing and walking contact passed with inspected screenshots. Physical-phone,
   follow-player and broader regional acceptance remain outstanding.
6. [ ] Acceptance: Maryland/Baltimore, Yosemite, Everglades, Amazon, Sahara,
   tundra, coast, Alps/Monaco; cache/failure/recovery, movement, disposal and
   mobile quality. Record real screenshots and performance, not source-only flags.
7. [ ] Update system inventory, architecture, data provenance and test guide;
   save clean commits and prepare the user's immutable test candidate.

Unverified work stays unchecked. Do not turn this list into a release assertion.

Checkpoint: 8d255d28 preserves curated vegetation, material integration and numeric
delivery refinements. 19 focused execution checks and source entry-graph checks
passed. Amazon, Yosemite, Sahara mobile viewport and tundra screenshots inspected;
Alpine load passed on a second run after an earlier timeout. Current profiling
measures dependencies and terrain boundary gaps rather than raising test timeouts.
