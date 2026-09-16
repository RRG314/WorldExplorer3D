# Release source identities

## September 16 forensic reconciliation and integration candidate

Observed production: `5.2.0+db62593ba377.6342cddaba06fc68.production`;
observed staging: `5.2.0+d73394916971.56b6bfc3840ee72e.staging`. These were
verified from public manifests and Firebase live-channel history on September 16.
The September 8 publication below was followed by a rollback and redeployment.

The preserved integration worktree is
`/Users/stevenreid/Developer/WorldExplorer3D-release-integration`, branch
`steven/post-5.2-release-integration`. Its initial source checkpoint is
`3a58be2fc35f361834827075efd43a1e418451e0`, incorporating the audited street
working tree. It is an unreleased candidate, not production approval. See
[release integration status](RELEASE_INTEGRATION_STATUS.md).

Everything below records earlier states. References to “now,” “current,” or a
working branch in those historical sections are not current deployment claims.

## September 8 production publication

With owner approval, production Hosting now serves
`5.2.0+1207f341322a.ea1852a7d5fd7648.production`. The live manifest confirms clean
source `1207f341322a`; later documentation and promotion-tool commits do not
change that artifact. The camera build includes the inspected East Pratt views.

Production now has its own domain-restricted Enterprise App Check registration,
Firebase Storage bucket in us-central1, 20 capture handlers and current access
rules. Billing handlers and paid reconstruction workers were not deployed.
The existing approved manual house was promoted from staging: 50 objects
(48 originals and two derivatives), 97,725,447 bytes, and three capture/
representation/patch-manifest records. Destination objects matched source size,
CRC32C and MD5, with no permanent download tokens. Ownership paths and object
generations were remapped to the existing production account. Staging is intact.

Live photo-workflow verification initially found missing cross-service Storage
rule permissions; the Storage service agent now has its prescribed Firestore
rules role. The backend can sign short-lived media URLs as its own service account.
Current live verification and repository integration status belong in the release
audit. Earlier reconciliation entries below are historical, not current blockers.

Reconciled September 7, 2026 against `c226b291`.

## Current candidate update

The earlier reconciliation below is historical evidence. Staging hosting now
uses clean branch commit `93470acb1767`, build
`5.2.0+93470acb1767.68ba49afe1848cc2.staging`. The old temporary snapshot is retired.
The production-configured artifact from that same commit was built and verified,
not deployed. Runtime bundles match; environment configuration and its fingerprint
intentionally differ. Manifests are retained in
`output/verification/candidate-parity/`.

Capture handlers and Storage rules were updated for the manual exterior flow.
The broader staging handler deployment was interrupted on request, but submitted
cloud operations finished: a subsequent read-only inventory found all70 handlers
ACTIVE. No further deployment is implied by that inventory. Reconstruction
workers were not updated, production was not changed, and live Stripe credentials
were not copied. Local gameplay verification is preferred; staging is reserved
for tests that benefit from HTTPS, account, media and trusted backend behavior.

The selected approved house has48 original photos and one approved manual
representation. Preflight found the same account email in production with a
different UID. Media/record migration remains a separate promotion action.
Production App Check configuration is also a pending promotion prerequisite.

## Source of truth

- Working branch: **`steven/building-exteriors-local`**.
- Checkout: `/Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70`.
- This branch is the source for the future production candidate, not an
  expendable staging experiment. Continue fixes here.
- Production commit `22b2f4ef4b07` and staging checkpoint `ba14127f` are both
  ancestors. No merge or wholesale snapshot copy is necessary to retain them.
- `steven/manual-capture-working-checkpoint` preserves the earlier working
  publication checkpoint. Do not reset the working branch back to it.

## Reconciliation performed

Compared all 1,412 tracked source paths with the isolated staging snapshot at
`/tmp/we3d-capture-phone-fix.DE4zLe`. Seventeen existing files differed; eight
tracked paths were absent from that older snapshot. All differing files except
one verification script matched an older sampled Git checkpoint. The remaining
UI verification script was inspected: the current version contains newer
gallery, manual-flow and authenticated-room readiness checks.

Also traversed snapshot `app`, `js`, `functions`, `scripts` and `config` trees:
no snapshot-only files were missing from the working checkout. Hidden files,
credentials, generated deployment output and installed dependencies were not
treated as source to import. No credentials were copied or printed.

Conclusion: **no missing staging-only runtime source was found**. The current
branch retains the staged functionality and newer work. This comparison does
not assert that every newer change is correct or that all cloud Functions match
the snapshot. The current staging manifest is a modified snapshot and must not
be treated as the complete clean branch build.

## What belongs in the release

Manual exterior photo editing, phone/account continuation, protected uploads,
revisioned save, moderator approval and building-specific world publication
belong in the production candidate after the documented fixes and acceptance.
So do the intended existing app upgrades already committed on this branch.

Interior room editing and paid 3D reconstruction stay preserved as development/
roadmap work, outside the ordinary public release path. Do not delete their
implementation or turn all Reality Capture into a staging-only feature.

## Source is not cloud content

Staging uses `we3d-staging-20260712`; production uses
`worldexplorer3d-d9b83`. Hosting deploys do not transfer accounts, photos,
capture documents, reviews, representations or access grants between projects.
Git protects implementation, not those Firebase records and Storage objects.

The owner's existing approved house must remain intact in staging. If it is to
appear in production, migrate that specific approved contribution deliberately:
resolve the production owner UID, retain the canonical building target, copy
only required media with checksums, replace environment-specific paths and
generation references, preserve provenance/review evidence, and verify private
originals and publication access. Do not bulk-copy staging test accounts,
benchmark captures, private spaces or permissions. No migration was performed
in this reconciliation.

## Anti-drift procedure from here

1. Make the release-blocking fixes on this branch; keep commits understandable.
2. Build the staging candidate from a clean commit, not a hand-edited temporary
   snapshot. Record the source fingerprint, dependencies, Functions/rules set
   and explicit exclusions for development workers.
3. Test that candidate. Staging and production builds use the same source and
   feature scope; Firebase project/configuration differences are intentional.
4. Freeze the accepted revision. A later fix requires targeted revalidation.
5. Update the stable branch through the normal reviewed integration when ready;
   do not reset or overwrite it to resolve drift. Production deployment and
   GitHub publication remain separate actions requiring the owner's go-ahead.

See [PRODUCTION_CANDIDATE_AUDIT.md](PRODUCTION_CANDIDATE_AUDIT.md) for unresolved
release blockers. This reconciliation preserves work; it does not certify
production readiness or claim a cloud backup.
