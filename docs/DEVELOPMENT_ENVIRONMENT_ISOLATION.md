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
