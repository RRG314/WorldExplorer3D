# Project Governance

World Explorer 3D is an owner-maintained public project. Steven Reid is the current project maintainer and final decision maker for releases, production infrastructure, moderation policy, data-provider commitments, and licensing.

## Contributions

Anyone may propose issues, documentation, data-provider adapters, tests, assets with compatible licenses, or code changes through GitHub. A pull request is a proposal until a maintainer reviews and merges it. Review considers correctness, user safety, accessibility, performance budgets, data provenance, licensing, and maintainability.

The realtime world server accepts declarative, budgeted resources. Contributions must not add uploaded executable room scripts, client-authoritative rewards, production secrets, or ways to bypass room permissions.

## Decisions

Small decisions are made in the relevant issue or pull request. Larger decisions should include the problem, alternatives, data and licensing implications, migration plan, and verification evidence. The maintainer may reject a technically valid change when its operational cost, legal terms, or long-term ownership are unclear.

## Production Control

Public source access does not grant production access. Firebase, hosting, billing, analytics, moderation, release signing, and deployment credentials remain owner-controlled. Community pull requests run against local fixtures, emulators, or explicitly authorized staging services.

## Licensing Status

Original project code and documentation are licensed under Apache License 2.0.
Third-party assets, data, and services retain their own terms; project branding
is not granted by the code license. Contributions require a DCO sign-off and
documented provenance. See `THIRD_PARTY_NOTICES.md`, `DATA_LICENSES.md`,
`MEDIA_LICENSE.md`, and `TRADEMARKS.md`.
