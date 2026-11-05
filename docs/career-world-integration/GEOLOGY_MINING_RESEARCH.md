# Geology, prospecting and mining research

The playable Geologist and Mining engineer courses already exist. The missing design is how to connect reference data, field interpretation and material work honestly without inventing a mineral economy or treating real geography as permission.

## Sources and what each can establish

| Data/source | Evidence class / coverage | Use in this app; important limits |
| --- | --- | --- |
| [USGS Cooperative National Geologic Map announcement](https://www.usgs.gov/news/national-news-release/usgs-cooperative-national-geologic-map-now-covers-50-states-us), September 3, 2026 | Version 2 expands to all states and most territories | National mapped-geology context. Announcement is not proof that the game’s literal older service has that dataset or that a rock is exposed at the player’s feet. |
| [NGMDB National Geology](https://ngmdb.usgs.gov/nationalgeology/) and [product record](https://ngmdb.usgs.gov/Prodesc/proddesc_118545.htm) | Compilations with original source maps/citations; product versions and layers matter | Inspect actual service identity, layer, scale and source citation before upgrading. NGMDB also catalogs maps; a catalog entry is not a uniform query layer. Browser fetch was 403 in this research pass; retained prior indexed metadata and publisher announcement remain separate evidence. |
| [Current game FeatureServer layer](https://energy.usgs.gov/arcgis/rest/services/Hosted/mapunitpolys_esurf_labels/FeatureServer/0?f=pjson) | Queried metadata still describes conterminous US composite surface units | Retain `usgs-cngm-surface` source identity; ArcGIS `currentVersion:12.1` is software version, not map v12.1 or CNGM v2. A numeric extent alone does not prove coverage. |
| [USMIN project](https://www.usgs.gov/centers/gggsc/science/usmin-mineral-deposit-database), February 2026 | Developing significant-deposit databases; separate mine-waste/abandoned-land/topographic-feature products | Pick a specific release/product, not “USMIN means all ore.” The project links multiple kinds of evidence with different purposes. |
| [USMIN topographic mine-feature release](https://doi.org/10.5066/F78W3CHG), v10 May 2023; [service page](https://mrdata.usgs.gov/usmin/) | Historical prospect/mine symbols digitized from topographic maps | Historical feature/reference layer only. `mrdata…/usmin/` is this product, not the complete current significant-deposit inventory. No present operational status, ore grade or safe access inferred. |
| [MRDS](https://mrdata.usgs.gov/mrds/) and [metadata](https://mrdata.usgs.gov/metadata/mrds.html) | Legacy worldwide metallic/nonmetallic reports, merged MRDS/MAS-MILS; systematic updates ceased in 2011 per current page | Optional historical references with explicit stale/duplicate/uncertainty labels. Never call it a current live deposit feed. Web-tool fetch failed 403; bounded direct request with the research User-Agent returned 200. Access is variable, not proof of absence. |
| [USGS resource assessments](https://www.usgs.gov/mission-areas/energy-and-minerals/energy-and-mineral-resource-assessments) | Regional estimates of known/undiscovered resources and uncertainty | Context for interpretation, not a verified mineral occurrence or mineable point. Do not turn estimated potential into guaranteed loot. |
| [Maryland Geological Survey quadrangle maps](https://www.mgs.md.gov/publications/map_pages/quadrangle_geo.html), [Sykesville SYKES2025.1](https://www.mgs.md.gov/maps/SYKES2025.1.pdf) | Detailed regional mapping; Sykesville sheet says valid at 1:24,000, fieldwork 2021–24 | Useful example of a better local source. Not evidence of exact coverage at a different Baltimore coordinate or permission to exceed stated scale. |
| [Macrostrat data services](https://www.macrostrat.org/docs/data-services) and [attribution](https://www.macrostrat.org/about) | API v2 regional map units, global coverage varies by original source | Existing fallback; CC BY 4.0 with Macrostrat and original-source attribution. Its map unit remains a reference, not a field observation. API v3 alpha is not an automatic upgrade target. |

## Six categories that must remain separate

1. **Mapped geological unit:** polygon/source/scale/age/lithology. It predicts context at map scale.
2. **Reported mineral occurrence:** a specific documented record with commodity, location precision, date and references; not guaranteed current material.
3. **Historical mine/prospect:** a reported feature/status from a particular date. It may overlap an occurrence but is not the same evidence.
4. **Resource assessment:** regional, probabilistic or estimated quantities/potential, not a point deposit.
5. **Inferred association:** an explicitly game-authored hypothesis relating mapped material to a possible learning opportunity; never presented as USGS fact.
6. **Authored game resource:** a finite virtual site/material/equipment interaction with its own custody, mass and completion rules.

## Recommended connected loop, with optional branches

Read a real reference → inspect an eligible virtual exposure → document a comparison → optionally follow a qualified authored quarry task → assay/work/sort/restore → transfer approved material through existing custody/economy → use it in supported construction/fabrication. Players may also start directly in the training quarry or remain purely observational. No compulsory Geology→Mining career ladder.

The current Geology course deliberately uses authored training rocks. Its saved map reference says `published-map-not-proof-of-training-rocks`. Preserve that distinction. The public Baltimore probe returned **Lowland deposits**, Quaternary sand/gravel, source Maryland 1968 at 1:250,000; this does not make the granite teaching specimen a real local outcrop. A good UI shows both cards and their different sources.

## Licensing and access

[USGS copyright guidance](https://www.usgs.gov/faqs/are-usgs-reportspublications-copyrighted) generally permits USGS-authored public-domain material, with third-party exceptions. Inspect each linked map/release’s rights and keep original citation/author/license; a USGS page linking a state map does not erase state/source conditions. Macrostrat requires attribution. Do not purchase assets. No bulk national download, user GPS logging, unsafe real-mine access instruction, or legal claim/extraction workflow is introduced.

Implementation boundaries, caching, outages and tests are in [USGS integration](USGS_DATA_INTEGRATION.md).
