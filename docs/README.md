# Developer documentation

Start with [Contributing](../CONTRIBUTING.md) for setup and validation.

- [Architecture](ARCHITECTURE_MAP.md): entry points, runtime owners and services.
- [System guide](SYSTEM_INVENTORY.md): where the main features live.
- [Environment isolation](DEVELOPMENT_ENVIRONMENT_ISOLATION.md): staging and production boundaries.
- [Versioning](VERSIONING.md): public versions and platform build numbers.
- [Release validation](RELEASE_VALIDATION.md): performance and verification definitions.
- [Gameplay measurement](analytics/README.md): consent-aware event semantics.

Player information is in the [README](../README.md), [controls](../CONTROLS_REFERENCE.md),
[release notes](../RELEASE_NOTES_5.7.0.md) and [known issues](../KNOWN_ISSUES.md).
[Data sources](../DATA_SOURCES.md) and [attribution](../ATTRIBUTION.md) describe
third-party content. Asset source records and required license notices remain
with their associated assets or in the specialist source directories.

Research drafts, design previews, operator handoffs, test recordings and raw
service output are kept outside the public source tree. Reproducible tests and
verification tools remain in `tests/` and `scripts/verification/`.
