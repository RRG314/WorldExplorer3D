# WebGPU evaluation

Recommendation: **keep WebGL for the current runtime; investigate an optional path later through a versioned renderer experiment**. No WebGPU performance benefit is established for this application.

The active renderer is Three r128 with custom materials/shaders and postprocessing. Current Three WebGPURenderer is not a drop-in swap for this graph. A renderer upgrade requires explicit material, lighting, texture color-space, animation, postprocessing and fallback parity. Safari 26 supports WebGPU; blanket claims that Safari cannot use it are obsolete. See current primary sources in [technology research](TECHNOLOGY_RESEARCH.md).

Current evidence includes over a thousand Earth draw calls in a dense walking scene, substantial Three matrix/render submission CPU samples, expensive first shader compilation, and changing street-light shader counts in a controlled fixture. Fixing avoidable work, batching and variant churn comes before assuming another graphics API will help. No GPU timer-query capture currently separates GPU shading time from CPU submission, so GPU compute or a renderer rewrite cannot be justified from these samples alone.

Candidate future experiments: one bounded terrain or particle/culling workload, identical visual output and device list, measured upload/readback and fallback cost. Keep semantic world/domain data renderer-neutral. Do not require WebGPU for entry, move collision queries to GPU with synchronous readbacks, or duplicate world authority to support two renderers.

No WebGPU code was added to production or the evaluation runtime.
