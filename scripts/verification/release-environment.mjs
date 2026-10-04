// Diagnostic entry points may select a subset; a release gate must run its
// complete default coverage. Gate commands can still deliberately opt into a
// scenario (for example the separate provider-outage gate).
export function completeReleaseEnvironment(environment) {
  const result = { ...environment };
  const allowed = new Set([
    'WE3D_VERIFY_ROOT', 'WE3D_VERIFY_BASE_URL', 'WE3D_VERIFY_ENGINE',
    'WE3D_VERIFY_HOSTED_PLACE_LOOKUP', 'WE3D_STAGING_APP_CHECK_FILE',
    'WE3D_PLACE_LOOKUP_EMULATOR_ORIGIN', 'WE3D_CAPTURE_AUTOMATION_ATTESTATION',
    'WE3D_CAPTURE_RELEASE_EVIDENCE', 'WE3D_REAL_GPU', 'WE3D_REQUIRE_IMMUTABLE',
    'WE3D_EXPECT_BUILD_ID', 'WE3D_EXPECT_ENVIRONMENT', 'WE3D_EXPECT_TAG'
  ]);
  // Release commands explicitly set their own scenario flags. Unknown parent
  // WE3D_* options must not silently turn a full gate into a diagnostic subset.
  for (const name of Object.keys(result)) if (name.startsWith('WE3D_') && !allowed.has(name)) delete result[name];
  return result;
}
