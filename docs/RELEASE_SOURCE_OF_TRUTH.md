# Release source identities

Verified September 25, 2026 from the hosted build manifests and GitHub release.
A version label or preview URL parameter alone does not identify deployed code.

| Reference | Identity |
| --- | --- |
| Latest published GitHub release | `v5.2.0-world-update` — A World Worth Making Your Own |
| Live production source | `db62593ba377e276e5079c78238fa3a83e501c93` |
| Live production build | `5.2.0+db62593ba377.6342cddaba06fc68.production` |
| Verified staging build | `5.3.0+56fcf94d400b.e1ad84e8534bf3fc.staging` |
| Candidate branch | `steven/post-5.2-release-integration` |
| Release branch | `stable` |

The live 5.2 source includes fixes after the last GitHub release. The 5.3 notes
therefore use both baselines and do not present those earlier fixes as new work.
The candidate branch also contains a later module-import consistency repair;
it is not yet the production build.

[Release comparison](RELEASE_COMPARISON_5.3.md) · [Release status](RELEASE_INTEGRATION_STATUS.md)

Earlier deployment reconciliations remain in this document's Git history.
