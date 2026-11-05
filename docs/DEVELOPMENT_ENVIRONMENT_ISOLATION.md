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

## Test identities and data

Use temporary staging accounts for service verification and revoke temporary
attestation credentials when the run ends. Keep raw identity records and media
outside Git and public build artifacts. Mocked, emulated and physical-device
results have different scopes; report which environment was exercised.

Production Hosting promotion uses the reviewed immutable package with explicit
production configuration. Backend changes are deployed separately and must
preserve existing account records, rules and secrets.
