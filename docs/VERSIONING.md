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

## Next release

Production currently runs **5.4.0**. The next update is **5.5.0**: compatible
features and substantial improvements to Earth coverage, transport, ocean
journeys, public environmental data and runtime ownership. A 6.0 release is not
justified because the intended save, room and supported-link contracts remain.
The 5.5 artifact is a candidate until verification and deployment complete.

`package.json` and the root package-lock entries own the product version.
The packaging process adds the commit, content hash and target environment.
Build metadata identifies artifacts but does not change version precedence.
Documentation, public release status and GitHub release publication must agree
with the deployed artifact. A passing workflow badge is not deployment evidence.
