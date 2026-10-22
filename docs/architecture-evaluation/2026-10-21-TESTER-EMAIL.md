# Tester email program

Owner request, October 21: make tester applications, owner notifications,
approval, confirmation/invitation links and replies usable without a developer.
This extends the previously local interest form. Baseline: clean `6ab4ff27` in
the canonical architecture-evaluation worktree. Production deployment is not
included: the owner’s earlier instruction ends at deployment readiness.

## Owner workflow

- Share `/account/testers.html`, or let players use the dismissible game popup.
  An applicant must request and explicitly confirm their email within 24 hours.
- A confirmed application emails the existing private notification mailbox and
  sends the applicant a receipt. Open **Admin → Testers** from the notification.
- Choose **Approve**. This saves approval and sends no invitation. Leave the
  download/access field blank while the new app is still being developed.
- When the app is ready, save its public HTTPS access link and getting-started
  instructions. Preview the recipient, email and access details, then choose
  **Send invitation**. Sending is an explicit separate action for each person.
- The tester accepts a 14-day invitation link before seeing the access details.
  The dashboard records acceptance and sends an owner alert. A replacement or
  revoked link cannot reveal access. Revocation cannot remove a build or link
  that somebody has already received or downloaded.
- Replies to `testers@mail.worldexplorer3d.io` and general messages to
  `support@mail.worldexplorer3d.io` forward to the existing owner mailbox. Reply
  there to reach the original sender. Attachments stay in the original Resend
  inbox; the forward explains this. Forwarding and delivery reports require the
  signed production webhook described below.
- Receipts and invitations contain a permanent **Stop testing invitations**
  management link. People can apply again themselves. Bounces/spam complaints
  suppress further contact. Closing an application sends no rejection email.
- This is a transactional testing program. It does not enroll anyone in a
  newsletter, create a marketing audience, or send bulk campaigns.

## Implementation and boundaries

`tester-program` owns private application transitions, capabilities, settings,
moderator actions and signed webhooks. `tester-mail` owns immutable outbox
messages and delivery. Existing request quotas/App Check protect signup; existing
`requireModerator` protects every admin action. Browser controllers pin the
signed-in owner, abort on disposal and clear private DOM on an account change.
No Firestore/Storage rule change or gameplay/session/state-store change is made.

A Firestore write trigger sends the outbox with Resend idempotency keys and
retries transient/ambiguous failures using the identical payload. Retries stop
before the provider’s 24-hour idempotency window (23 hours from job creation).
Expired/unsafe jobs require attention; the UI does not offer an unsafe retry.
Provider acceptance, actual delivery, bounce and complaint are separate states.
Delivery events can arrive before the send response; a private receipt bridges
that race. In-flight mail already accepted by the provider cannot be recalled.

Only verified, raw-body-signed Resend events enter the webhook. The installed
Svix v2 verifier returns no parsed event: JSON is parsed only after successful
verification. Incoming forwarding accepts only the two owned aliases, uses the
configured sender with original Reply-To, escapes content, deduplicates by
provider ID and limits forwarding to 30/hour. Original incoming mail remains in
Resend if forwarding needs to retry. Messages from the configured system sender, marked forwarded messages and
automated replies are ignored to avoid loops. Manual messages from the owner
mailbox remain deliverable. No attachment is automatically relayed.

Temporary confirmations expire after 24 hours and are scheduled for deletion after
two days. Mail/provider-receipt records use 30-day TTLs. Expired invitation
capabilities have a TTL; management capabilities and private application/consent
state remain to honor withdrawals. Deletion requests go to support. Provider and
owner-mailbox retention are their own settings, not the Firestore TTL.

## Verification

Ignored evidence: `output/research/tester-program-2026-10-21/`.

- 21 focused request/program/security cases passed. Coverage includes consent,
  reconfirmation without lost approval, approval before a build exists,
  competing actions, stale previews, exact retry payloads, expiry, withdrawal,
  replaced/revoked links, early delivery events, suppression, forwarding and
  forged/stale/modified webhook signatures.
- Six isolated Firestore-emulator checks passed using the real Admin SDK and
  current rules: atomic confirmation, real approval contention, invitation and
  outbox writes, acceptance/withdrawal, 30-item cursor pagination and direct
  read/write denial to eight private collections. Anonymous, ordinary and
  admin-claimed clients are all denied direct access. The emulator does not
  prove that production composite indexes have finished building.
- Seven actual Chrome component journeys passed using the real public pages,
  admin component and program core with controlled auth/API transport and a
  simulated provider. Includes failure/retry/delivery and same-tab email-link
  replacement. Mobile and email-preview screenshots were inspected; no page
  errors. The existing popup’s five consent/failure/dismissal cases also passed.
- Initial failures remain: v2 verifier return-value assumption; missing shell
  Java path and SDK test import; same-document email fragment handling. Each was
  diagnosed before its bounded rerun. No full-city/release matrix was repeated.

These are local source, controlled browser and emulator checks. They are not
proof of live email delivery, forwarding, inbox placement or production release.
Previously completed game checks remain evidence only for unchanged game bytes.

## Activation checklist for the authorized release

1. Use protected release/staging workflow and the new hash-bound candidate.
   Preserve the existing released package, current dist, all distinct rollbacks
   and 80 existing production Functions/configuration. Do not use development
   `.env.local` values as live email configuration.
2. Add only `registerAppTester`, `manageAppTesters`, `deliverAppTesterMail` and
   `appTesterEmailWebhook`. Provision their needed existing Resend sender/key,
   private owner-notification address, admin allowlists and allowed origins from
   the deployed configuration; never print or check these values into source.
   An account’s existing Resend integration does not automatically populate a
   new Function’s environment.
3. Add the two composite indexes (application status/update time; outbox
   application/create time) and six tester TTL policies in `firestore.indexes.json`.
   Keep all unrelated indexes and rules. Wait for required indexes to be ready.
4. Create the production Resend webhook for `email.received`, `email.delivered`,
   `email.bounced`, `email.complained`, `email.failed`, pointing at
   `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/appTesterEmailWebhook`.
   Put its signing secret in Secret Manager as
   `WE3D_TESTER_RESEND_WEBHOOK_SECRET`; bind it only to that Function, with the
   necessary secret-version access. Preserve unrelated webhooks. Enable inbound
   forwarding in production only so staging cannot duplicate owner notifications.
5. Publish the email/admin/public application pages, root modules/styles, privacy
   and contact changes with the reviewed Hosting rewrites. Confirmation links use
   the canonical production or staging origin; do not send links before their
   matching landing page and API exist.
6. Check the signature boundary and enabled webhook; then set the operational
   `appTesterProgram/current.webhookEnabled` flag to true. This flag reports
   activation in the private dashboard; it is not a substitute for verifying the
   provider endpoint, signature secret and permissions.
7. Perform one real application to the owner’s chosen test address; confirm the
   owner alert and receipt, dashboard approval, preview/invite/accept and reply
   forwarding. Check provider delivery, the owner mailbox and withdrawal. Do not
   send to unrelated people or claim provider acceptance proves inbox placement.
   A real app URL can be added later; approval alone is supported meanwhile.

Read-only live inspection found the existing Resend sender/key and private owner
notification address configured, and `mail.worldexplorer3d.io` verified for both
sending and receiving. There was no receiving webhook; the previously advertised
root-domain mailbox had no MX records. Public contact links now use the verified
subdomain; no DNS or live service setting was changed during this implementation.
The new flow is local until the coordinated activation and real-email check.

## October 22 — owner-requested real end-to-end test and UI alignment

The owner explicitly requested an actual email/signup journey, then asked for UI
consistency and a clean workflow. This follow-up uses isolated staging with real
Resend delivery to the connected owner Gmail mailbox (and its test plus alias),
not a production release. Production Hosting, existing 80 Functions, DNS, rules,
release branches and player data remain unchanged. No push is needed for this
staging test. The earlier blanket no-deployment statement describes the first
local implementation, not this subsequent owner-requested staging verification.

Public application/confirmation pages reuse the existing landing header, logo,
type and button styles. The private component uses existing admin button/card
classes and theme variables; applications stay visible above collapsed setup,
and approval/send move to their resulting status. Email activity is collapsed
except for delivery problems. The private settings show where owner alerts go.

Staging outbound mail is restricted to the configured owner addresses and gets
a clear [TEST] subject/footer. Staging inbound processing accepts only the
explicit owner test sender; production owns ordinary inbound traffic. This
prevents a temporary staging webhook from forwarding unrelated customer mail.
The prior own-mailbox blanket filter was too broad: a legitimate manual support
message from the notification address was discarded. Loop protection now uses
the exact system sender, Auto-Submitted and an X-WE3D-Forwarded marker instead.

Current execution evidence and test boundaries are recorded under
`output/research/tester-live-e2e-2026-10-22/`. Production activation is still a
separate approval/release action; a staging pass does not claim it occurred.

The first real send reached Gmail Inbox but lacked [TEST]. The native Functions
API deployment exposed FIREBASE_CONFIG without GCLOUD_PROJECT. This also bypassed
the intended staging recipient filter. Signup was paused and the temporary
webhook disabled before proceeding. Tester runtime identity now resolves the
existing Firebase configuration and supported cloud project variables, rejects
conflicts, and fails closed for unknown email origins before quota admission or
sending. The resumed test must verify the marked subject and recipient boundary;
the original successful delivery and configuration failure remain separate
evidence. This also prevents an unrecognized production runtime from silently
generating staging confirmation links.

The October 22 owner correction extends newly requested confirmation links to
24 hours. Confirmation cleanup is scheduled after 48 hours so TTL cannot remove
a still-valid link. Hourly abuse quotas and 14-day invitation expiry are separate
and unchanged. Existing already-sent links retain their original expiry. Email,
public form, game popup and privacy wording agree. Clock-controlled checks cover
one millisecond before expiry and the exact expiry boundary.

The resumed real worker exposed an additional runtime issue before our handler:
the Firebase v1 adapter requires GCLOUD_PROJECT, but this runtime supplies only
FIREBASE_CONFIG and the API rejects setting the reserved variable. At tester
export initialization, normalize the validated, consistent configured project
into the SDK's required environment key only when absent. A real SDK adapter
check covers this boundary. Existing queued events retry; do not recreate jobs
or bypass the worker. The rejected configuration patch and initial test-fixture
errors are retained. A used confirmation now reports an existing withdrawal
truthfully; only a fresh confirmation reapplies. Invitation errors direct people
to request a replacement by replying to their invitation.

Real staging delivery recovered through the existing trigger retries, including
the original queued owner alert and receipt. Preview/send produced one delivered
invitation. A manual Gmail reply reached the owned testing alias and forwarded
back into Gmail Inbox with its original sender, subject and test body intact.
The full authenticated admin shell exposed a mobile overflow missed by the
isolated component fixture. The small-screen header now stacks and its identity
wraps; actual shell bounds pass at 320, 390, 720 and 1360 pixels. This is a layout
repair, not a change to permissions. A favicon reference prevents the shell's
implicit missing icon request. Invitation acceptance/withdrawal resume from the
existing sent invitation; do not resend it. The same-document navigation driver
must await fragment consumption before asserting URL privacy.
