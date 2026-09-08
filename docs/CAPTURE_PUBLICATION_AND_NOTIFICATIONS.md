# Capture publication and notifications

September 7, 2026. Work in progress; no production deployment authorized.

## Audit findings and acceptance plan

1. **In progress — manual submission/publication.** Existing hybrid preview cannot be submitted or approved. Preserve one capture flow, validate a small photo set without starting a GPU job, generate bounded cropped derivatives from immutable originals, snapshot the submitted revision, and use the existing admin queue. Approval must publish only that reviewed revision. Patch representations must retain the underlying building and be discoverable by canonical building ID after a new load, not only by the submitting launch origin. Verify real pixel derivatives, permission denial, stale moderation, preservation of uncovered geometry and fresh-runtime retrieval.
2. **Pending — account/admin integration.** Show drafts, processing, manual fallback, submitted revision, decisions and publication state through existing capture/account and admin pages. Originals and approved assets must remain distinct. Keep previously approved regions when contributors improve other regions; reject unresolved overlaps rather than silently destroying other work.
3. **Pending — notifications.** Use existing users/{uid}/notifications for account notices, a durable deduplicated capture-event record, existing Resend settings for moderator email, and Firebase Web Push device registrations. Prompt only after a user gesture; support unsubscribe/account switching and revalidate moderator authority. No private images, addresses or credentials in lock-screen payloads. Delivery failures must be visible and retryable without duplicating the approval itself.
4. **Pending — acceptance.** Admin approval -> actual world patch rendering -> hard refresh; no original leaks; no duplicate queue authority; phone-width UI and physical-device notification testing distinguished; no production publication until requested.

## Configuration found

Staging Resend API key, sender and moderator recipient were empty. Owner requested `sreid1118@gmail.com` as recipient. Credentials must remain server-side and cannot be fabricated. Firebase project already exists; messaging sender ID alone does not prove a device is subscribed or that push is delivered.

## Focused research

- [Firebase Web Messaging](https://firebase.google.com/docs/cloud-messaging/web/get-started): requires notification permission and a registered service worker; VAPID configuration belongs to the project, not user-entered secrets.
- [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): on iPhone/iPad, use a Home Screen web app and request permission in response to direct interaction. Ordinary mobile tabs are not equivalent.
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys): deduplicate retries of the same message. Persist application event identity independently of provider retry windows.
- [OpenCV planar homography](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html): four-point perspective correction is suitable for a planar surface, not a reconstruction of hidden geometry or an occluder-removal algorithm.

These references support the design; they do not certify implemented delivery or publication.
