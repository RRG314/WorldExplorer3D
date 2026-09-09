# Development and production isolation

Source checkout and staging hosting use `we3d-staging-20260712`. Live production
uses `worldexplorer3d-d9b83`. Do not connect development or acceptance tests to
production data. Do not copy private production records into staging implicitly.

`js/firebase-environment-policy.js` rejects production project, bucket, auth-domain
and app identifiers outside the explicit HTTPS live-host allowlist. Firebase init,
stored-config writes, analytics initialization and Functions overrides enforce the
policy. Source config application defaults to staging and rejects production;
the release builder injects explicit environment configuration into dist instead.

Changing files does not reconfigure an already-running browser page. Reload old
test tabs before use; do not clear their IndexedDB/photos. Staging sign-in and
uploads are independent of production, even when the same email is used.

Use staging HTTPS for camera, authentication and real upload acceptance. Keep
App Check and private-storage rules enforced. No paid reconstruction is required
for manual photo placement. Local emulator tests are suitable for destructive
test records; mocked transport checks alone do not prove staging acceptance.

The live manifest inspected on 2026-09-09 identifies commit `db62593ba377`, which
is an ancestor of this work branch. This is continued application development,
not a replacement project. Staging data is intentionally separate from live data.

Nine environment-policy regression checks cover local, LAN, file and preview
origins, live-host configuration, Functions overrides and stale global config.
The earlier source production config lacked its App Check site key while the
capture backend requires an App Check token; that is a concrete configuration
defect consistent with the user's token error. No production records were changed
as part of this isolation fix.

## Automated staging acceptance — 2026-09-09

The ordinary automated browser received `403 App attestation failed` from the
App Check exchange. Staging's reCAPTCHA domain allowlist correctly includes only
its two staging hosting domains, not localhost. The provider configuration and
site key match, with the existing minimum score of 0.5 unchanged. No individual
reCAPTCHA score was obtained, so the exact assessment reason is not claimed.

Firebase documents a debug provider for automated/CI environments:
https://firebase.google.com/docs/app-check/web/debug-provider

`scripts/verification/reality-capture-hybrid-staging.mjs` now automatically uses
the existing temporary staging-only attestation helper and refuses production
before creating a browser or account. The credential is injected into that test
browser only, never hosting or source configuration, and revoked after the run.
Backend App Check enforcement, account authorization and privacy rules remain on.

Against staging build `5.2.0+3f0c304b099d.9ab3b9b57b935a60.staging`, exterior and
home runs passed real sign-in, account listing/opening, photo Storage upload,
revision conflict rejection, save/reload, manual CPU submission to review, paid
reconstruction rejection and permission-required interior creation. The home run
also resolved the private authored interior, edited its room name through the UI,
opened the inside view, saved revision 3 and reloaded it. Screenshots inspected
at a 390px viewport. Synthetic fixtures and accounts were deleted; temporary
attestation credentials revoked. No production writes or public approval.

These checks verify real staging persistence and authenticated UI using a test
attestation identity. They do not certify a physical Android device's normal
reCAPTCHA assessment, the user's own account, or approval-to-world publication.
