# Capture contributor and moderation workflow audit — September 8

Status: local changes, not deployed. This is not an end-to-end production signoff.

## Confirmed gaps

- Production capture landing page explicitly instructed users to start on a computer.
- The shared editor placed device handoff above capture actions without explaining it was optional.
- The account admin link opened a generic dashboard; moderation defaulted to overlays.
- Admin overview counted overlays and legacy submissions, but omitted reality captures.
- Manual capture submission did not invoke the existing legacy contribution email sender.
- Read-only production Function configuration inspection found no email sender address.
  Staging also lacks a sending key. Existing recipient configuration alone is insufficient.
- Capture editor colors and fonts were separate from the game's interface-v4 presentation.

## Local changes

- Same-device instructions; optional collapsed handoff. Save versus Submit is explicit.
- Account links directly to building approval queue; admin defaults to captures and supports capture deep links.
- Authoritative pending capture count and admin overview alert.
- Shared capture presentation uses game interface tokens on both editor variants.
- Firestore submission trigger sends a minimal authenticated-review link via existing Resend configuration.
  No private photos, signed asset URLs, addresses or personal details are placed in email.
  Saves do not send notices. Revision/event filtering prevents self-triggering.
  Provider acceptance is explicitly not called delivery. Permanent errors and missing configuration
  remain visible; transient failures retry within a 23-hour window. Provider idempotency keys
  follow https://resend.com/docs/dashboard/emails/idempotency-keys (24-hour retention).

## Evidence

- 51 Node tests passed before the additional retry-window test (authority, HTTP security, notices).
- 1100px desktop and 412px touch editor integration passed actual normalization, CPU derivative,
  photo placement, save/reopen and private submission with mocked HTTP. Screenshots inspected.
- Prescribed web-game client captured the standalone sign-in/capture page; screenshot inspected.
- Production configuration and capture HTML inspected read-only. No real email sent.

## Remaining gates

- Configure a valid sender and verify an actual email send; acceptance is not inbox delivery.
- Deploy selected changes to a test environment and verify real moderator inspection, approval,
  publication and hard-refresh from a separate account, including private-interior denial.
- Test the actual Android camera/library flow and in-game return without losing position.
- In-site queue alerts are present locally; general user inbox and push delivery are not implemented here.
- Existing pending submissions predate the new trigger; they appear in the queue but are not automatically emailed.
- Queue pagination/deep links outside the fetched page and notice retry from admin remain follow-up work.
- Do not treat these changes as authorization to publish private interiors or deploy production.
