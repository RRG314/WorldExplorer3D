# Release versioning

World Explorer uses [Semantic Versioning 2.0.0](https://semver.org/). The release
number describes compatibility and delivered changes, not code volume or the
number of internal refactors.

The compatibility contract covers persisted Explorer and expedition records,
shared-room commands and data, published HTTP interfaces, and supported links
used to open places and contributions. Rendering internals are not a public API.

- **Patch:** compatible corrections to existing behavior.
- **Minor:** compatible features or substantial internal improvements.
- **Major:** incompatible changes to the compatibility contract, such as removing
  an established command or abandoning supported saves without a migration.

Changing a renderer or reorganizing modules does not by itself require a major
release. An intended migration must be tested before compatibility is claimed.

## Platform versions

The public release number is **5.7.0** for web, Android and iPhone/iPad. A first
Apple release can use the same public version as the existing game. Store
availability is listed separately on the download page.

Android uses an increasing `versionCode`; Apple uses an increasing
`CFBundleVersion`. These build numbers are independent of the public version.
They must increase for a replacement store upload, even when its public version
is unchanged.

`package.json` and the root package-lock entries own the product version.
The packaging process adds the commit, content hash and target environment.
Build metadata identifies artifacts but does not change version precedence.
Documentation, public release status and GitHub release publication must agree
with the deployed artifact. A passing workflow badge is not deployment evidence.
