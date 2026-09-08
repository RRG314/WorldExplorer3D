# Evidence ledger and gap closure

Scope: Earth appearance/vegetation R&D for Steven, global/browser/mobile, current local architecture. Preserve transport and ground authorities. Discovery → code/source reconciliation → targeted license and technique checks → synthesis → HTML artifact inspection. The update_plan tool was searched for but is not available in this session; this records the scoped plan instead.

| Claim family | Primary evidence | Confidence / remaining gap |
| --- | --- | --- |
| WorldCover WMS is display RGB, unsuitable for analysis; numeric products exist | ESA, “Data access”, https://esa-worldcover.org/en/data-access (accessed 2026-09-08; webpage update date not given). Source code `worldcover-baseline.js` | High. Site-level class accuracy remains unverified. |
| Terrain materials use weighted layers; world-aligned projection avoids single-plane stretching | Epic, Landscape Materials and Texturing Material Functions, links in report (accessed 2026-09-08; docs version 5.8) | High as established technique; Three shader implementation/performance must be measured. |
| Copernicus is DSM, not unrestricted bare earth | Copernicus Data Space, collection description, link in report (accessed 2026-09-08) | High. Current accepted provider coverage not audited globally. |
| FABDEM licensing constraint | University of Bristol, FABDEM V1-2, link in report (accessed 2026-09-08) | High for published NC-SA restriction. No license purchase or legal determination made. |
| Climate candidate and license | GloH2O Köppen-Geiger publisher page, https://www.gloh2o.org/koppen/ (accessed 2026-09-08); Beck et al. 2023 DOI 10.1038/s41597-023-02549-6 | Publisher explicitly grants dataset CC BY 4.0; general website terms differ, so archive the specific downloaded dataset license at ingestion. Direct Nature open failed; publisher and DOI search corroborated. |
| Instancing bounds, LOD | Three.js InstancedMesh/LOD official docs, links in report (accessed 2026-09-08) | High. Imported asset and phone budgets remain unknown. |
| Ecosystem placement methods | Epic Procedural Foliage Tool, link in report (accessed 2026-09-08) | Technique evidence, not proof of ecological truth. |
| Sketchfab candidates | Creator listing titles/authors/direct URLs in report (accessed via indexed primary pages 2026-09-08) | Metadata only. Direct access sometimes 403. No visual acceptance, license-file audit, or import benchmark. |
| Existing code defects | Relevant files and paths in report inspected on branch `steven/building-exteriors-local` | High source evidence; no claim every location reproduces every issue. |

Queries: WorldCover official data access; official DEM/3DEP/FABDEM; Epic landscape/foliage/world-aligned materials; Three.js instancing/LOD; publisher Köppen license; specific Sketchfab tree pack names. Two bounded research lanes handled data/rendering and vegetation/assets. Parent re-opened consequential source pages and inspected the classification, unavailable-state and polygon-cap code. Stopped broad discovery after the integration direction was supported. Follow-up work is implementation/benchmarking, not more generic searching.

Deliverable: `ground-ecosystems-plan.html`; canonical internal source: `report-source.md` (HTML-compatible Markdown). No environment functionality documented as implemented.
