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

Production currently runs **5.3.0**. The visual-quality work is targeting
**5.4.0**, provided existing saves, room commands and links remain compatible.
Use `5.4.0-rc.1` for the first packaged release candidate after the remaining
acceptance work. A 6.0 release is not justified by refactoring alone.

The GitHub 5.3 release remains a draft; this does not make deployed 5.3 code
unreleased. Do not overwrite its version with new runtime changes. The final
5.4 notes must describe the difference from the deployed 5.3 build.

`package.json` and the root package-lock entries own the product version.
The packaging process adds the commit, content hash and target environment.
Build metadata identifies artifacts but does not change version precedence.
Documentation, public release status and GitHub release publication must agree
with the deployed artifact. A passing workflow badge is not deployment evidence.
