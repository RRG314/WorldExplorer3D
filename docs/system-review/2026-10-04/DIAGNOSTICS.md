# Support and scene diagnostics

Settings now offers a copyable support report, with a selected-text fallback if clipboard permission is unavailable. The player can inspect it before sharing; it is not uploaded automatically. The report accepts only fixed operation/provider/error categories, validated build identity, session/world generations and environment/mode/transition state. It excludes coordinates, names, account identifiers, arbitrary request data, raw error messages/stacks and media. Its history is bounded to 32 events. Error recording currently covers runtime exceptions, provider failures, world load failure and selected persistence failure boundaries; it is not a promise that every possible failure is classified.

`getWorldExplorerSceneResources()` performs an on-demand traversal of the active presentation owner's scene. It deduplicates shared geometry buffers, materials, textures and skeletons; counts instances, shader-uniform textures, shadow targets and the scene environment; and reports the renderer's last-frame calls, triangles and program count. It includes hidden objects, so its geometry count can exceed renderer-uploaded geometry counts. It excludes detached caches and compositor targets. Texture byte estimates describe source formats, not actual GPU allocation; unknown dimensions remain explicit. Earth collider values count registered building/structure records and exclude terrain, water, actor and interior analytic constraints. Ocean/Space collider coverage is unmeasured, represented by null rather than fabricated zeros.

Animation measurement requires `?diagnostics=1` and an explicit call. Its temporary AnimationMixer probe restores the original method on completion or cancellation and rejects a changed environment. It counts only mixers belonging to the captured scene. Procedural motion is outside this measurement. Instrumented animation timings do not approve normal frame cadence.

## Measured desktop baselines

Actual local assembled app, M1 8 GiB, Chrome 154, 1440×900, balanced. The second complete run is `output/verification/architecture-polish/diagnostics-browser-rerun/report.json`. Source preview, disposable staging attestation; Ocean bathymetry response controlled. Screenshots inspected. This is not ordinary hosted or physical-phone evidence.

| Scene | Materials | Geometry source MiB | Texture source estimate MiB | Skeletons | Animation CPU / 2 s probe |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baltimore walking spawn | 2,619 | 221.9 | 231.4 | 39 | 77.8 ms, 61 mixers |
| Initial Space flight | 279 | 2.86 | 280.0 | 0 | No AnimationMixer updates |
| Coral Shelf submarine | 39 | 4.39 | 19.25 | 0 | No AnimationMixer updates |

`config/scene-resource-budgets.json` sets initial regression ceilings for these exact scenes, with roughly 25–50% headroom for scene-owned sources and observed dynamic variation. They do not establish a universal content or geographic limit. Existing normal performance/renderer/hitch budgets remain unchanged. The registered browser gate checks these ceilings; boundary tests reject missing or excessive values. Earth lifetime/teardown remains independently checked by the sustained twelve-reload performance gate. Additional authored scenes must acquire their own measured fixture before claiming coverage.

Actual UI checks cover successful clipboard copy, private-value exclusion, denial fallback, selected text, phone width/touch height, casual rankings and Ocean diver context. A rankings refresh defect found during image review is fixed: each selected board immediately shows its own local state and accepts only its latest asynchronous query, including repeated requests for the same board. A delayed-reply regression verifies this behavior.
