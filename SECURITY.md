# Security Policy

## Reporting a Vulnerability

Please do not disclose a suspected vulnerability in a public issue or discussion.

Use GitHub's private vulnerability reporting for this repository:

https://github.com/RRG314/WorldExplorer3D/security/advisories/new

Include the affected route or component, reproduction steps, expected impact, and any supporting screenshots or logs. Do not include real user data, passwords, access tokens, private keys, or payment information.

## Supported Version

Security fixes are applied to the current production release and the active release branch. Older releases may not receive patches.

## Secrets and Production Access

The public repository does not grant access to production Firebase, hosting, payment, or administrative systems. Production changes require owner-controlled credentials and deployment permissions that are not stored in the repository.

## Development and Build Runtimes

Use Node.js 22.23.4 or a later patched 22.x release. The root package engine and
`.npmrc` reject older versions during normal dependency installation. Functions
retain the managed `nodejs22` runtime and its automatic security update policy;
the local Node version does not attest the managed provider's patch version.

Workflow actions use reviewed commit hashes. The secret scanner uses a fixed
version and archive checksum, with synthetic credential checks that prevent
public Firebase configuration exceptions from hiding private credentials.
Dependabot changes require review and the protected branch's checks; they do not
automatically merge or deploy. Audit results identify known advisories and do
not establish that software is free of vulnerabilities.

Python tooling requires patched Python 3.13.17 or later 3.13.x, or Python 3.14.9
or later 3.14.x, with pip 26.2.2 or later and certifi 2026.10.19 or later when
installed. CI checks the Python/pip floor before installing projection tools.
General dependency version-update PRs are disabled; advisory-driven security
updates remain enabled and require protected review/checks. Official JavaScript
actions use their supported Node.js 24 runtime.

Capture containers install the official Node 22.23.4 Linux binary only after
verifying its SHA-256. Runtime refreshes start from the reviewed deployed image
digest, verify existing worker/Meshroom file hashes and restore the original
worker UID. Future runtime builds pin the refreshed image digest; full rebuilds
also verify the reviewed Meshroom archive checksum. A container smoke check does
not replace a separate end-to-end photogrammetry acceptance run.

Local preview servers accept their configured local Host and Origin only. They
deny hidden files, dependency directories, operational output and symlinks that
escape the selected root or reach protected files. Error responses contain no
stack traces. Their HTTP regression checks use synthetic files and own their
server processes.
