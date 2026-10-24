# Android test package

The first Android test runs the released World Explorer 3D browser game using
Google's Android Browser Helper / Trusted Web Activity. This preserves the
existing geographic source, world/session owners, progress and online services.
It is not the future Godot version. Internet access and a compatible current
browser are required. Do not promise unlimited worldwide streaming or offline
world play.

## Build and signing

- Package: `io.worldexplorer3d.app`; published internal code `2`, name `5.6.1-test.2`.
  The next candidate is code `3`, name `5.6.1-test.3`, pending build/publication.
  The first undistributed internal upload, code `1`, remains in Play's history.
- Minimum Android API 29 (Android 10), matching current Chrome support;
  compile/target API 36, as currently required for new
  phone/tablet submissions. No native renderer or bundled world copy.
- `android-test.yml` builds/lints unsigned APK/AAB on the existing GitHub runner.
  Resolved dependencies and SHA-256 verification metadata are checked in; the
  Gradle distribution is checksum pinned. The Mac needs no Android SDK.
- Run `node scripts/android-sign-release.mjs <downloaded artifact directory>`
  with the existing local JDK. The helper creates the durable upload key only
  when absent, refuses to replace a stranded key and keeps its credential under
  owner-only `~/Library/Application Support/WorldExplorer3D/android-signing/`.
  Keep a secure owner-controlled backup. Never commit or upload that directory.
- Google Play signs distributed APKs with a separate app key. The canonical
  site's `/.well-known/assetlinks.json` must include that **Play app certificate**
  as well as the local APK/upload certificate. Never add a shared debug key.
  The Hosting builder publishes a static canonical copy of `app/assetlinks.json`;
  a rewrite cannot override Firebase's automatic association response. Other
  hidden files remain excluded and Firebase's automatic association mode stays
  intact for unrelated platform associations.
- The installed wrapper adds Internet/network-state permissions. Location and
  camera continue through browser consent. There is no native advertising,
  billing, analytics or notification SDK and no JavaScript/native bridge.

## Recovery and data

The Play candidate opens with `distribution=google-play`, including deep links
handled by the existing Browser Helper. A small browser presentation context
persists through same-tab navigation, reloads and same-origin new-tab links;
storage denial preserves it in URLs. This context never grants account benefits.
The edition consumes existing entitlements and receipts, hides external purchase
offers and rejects checkout/upgrade-capable portal calls before a request.
Ordinary web commerce retains its existing protected API. Do not add a purchase
button to the Play edition without implementing applicable Play payment policy.
`npm run verify:play-distribution` covers that boundary and the consistent public
name **World Explorer 3D**. The package identifier remains unchanged.

The native launcher handles a first launch without connectivity. The game's
scoped navigation worker handles later offline/server-failure navigations with
an explicit Retry screen. It stores no caches, queues no requests and does not
intercept account/API, asset or module requests. It preserves 401/403/404 and
successful responses. Existing world-data and save ownership remain unchanged.

Account Center already provides recent-auth, confirmed account deletion. Public
instructions are at `/legal/delete-account.html`. Browser-local progress/drafts
are separate from online account records and from Android uninstallation.

## Play setup and content facts

The owner confirmed a **free download**. Do not register a paid merchant account
or enable billing to distribute this test. Use an internal track first (up to
100 selected Google accounts), then a properly configured closed track. This
account's Console requires 12 continuous opted-in closed testers for 14 days
before applying for public production access. Internal testing does not replace
that requirement or imply policy review passed.

Complete the audience and IARC questionnaire from actual content. The equipment
catalog includes a laser gun, pulse/compact/response sidearms, a melee staff,
paintball and grenades. Humanoid NPCs can be damaged/downed and can fire back;
vehicles and responders can be damaged. Impact effects use colored flashes,
geometric marks and blast rings. Disclose violence against human-like characters,
weapon/explosive use, multiplayer chat/user interaction and optional sharing.
Do not select a nonviolent/all-young-children description or advertise a regional
rating before IARC assigns it. Consider user-generated text/media separately
from authored effects. Source facts are not a physical-device visual review.

Before closed/public testing, finish the real Data safety, app-access, audience,
rating, category and listing forms. Include Firebase/browser analytics, optional
location, account/social data, text and photo/contribution uploads; a thin native
wrapper does not make the service “no data collected.” Review the existing
web donation/account-recognition checkout against Play's current payment policy
before widening distribution. Do not claim that this initial internal upload
establishes payment-policy approval.

## Focused acceptance

`npm run verify:android-web-support` exercises navigation recovery boundaries and
install icons and is registered in the normal component suite.
`npm run verify:android-install-browser` executes real worker registration,
offline/retry, retained local data, no asset caches and account-scope exclusion;
it uses the existing owned-browser cleanup helper and loads no world.

Android compilation, lint, package metadata and signature verification are
separate from installed-device acceptance. On an actual Play-installed phone,
verify full-screen association, cold launch, offline/retry, portrait/landscape
touch, background/resume, sign-in/App Check, selected-place loading, retained
progress and personal/weekly rooms. Reuse unchanged browser qualification for
other game features; do not repeat the historical full release matrix. Record
physical frame time/loading/thermal limits honestly instead of relabeling the
Mac's mobile-layout measurements as phone performance.

Operational evidence and failed attempts: `output/research/android-testing-2026-10-23/`.

## October 24 observed status

Version 2 has been uploaded, validated and published to the active internal
track. Only a fresh owner-only World Explorer tester list is selected. The
owner-eligible opt-in page is
https://play.google.com/apps/internaltest/4701521177239633849 . Testers must use
the Google account selected for that list. Google displays the temporary package
name until app review; this is not public Play production approval. Code 1 is
excluded. The native package has not changed or been rebuilt.

Free pricing and basic declarations are saved, including No advertising ID.
The corrected IARC questionnaire is Completed: ESRB Teen, PEGI16, USK16,
generic/Russia16+, Brazil14+, South Korea15+, TaiwanPG12, AustraliaPG and Saudi
Arabia18. It accurately includes rare field medicine, human violence, interaction,
location sharing and digital purchases. No unsupported war or user-blocking
claim remains. Target audience is saved as 16–17 and 18 and over.

Store text, icon and feature graphic are saved as a draft. Required genuine app
screenshots remain outstanding. Data safety retains its 16-category/security/
account-deletion draft; per-type handling/purposes and provider/analytics sharing
still require final review. Limited analytics is cookieless measurement, not a
complete opt-out. No false No-data or independent-security-review badge was used.

A dedicated empty, non-admin reviewer account with complimentary Pro access has
passed normal password sign-in and its own-profile read. Credentials are private
outside source/evidence. The owner authorized continuation after the specific
reviewer-access question; access and instructions are now saved with Google.
Optional partner/device-feedback sharing is off. Instructions require no owner login, purchase,
expiring trial or OTP. This is not Android UI or App Check qualification.

Before wider distribution, resolve two source-confirmed policy gaps. Existing
Stripe Pro checkout grants digital room/feature benefits, so it cannot be assumed
to qualify as a pure tip. A consumption-only Android experience can retain web
commerce and existing benefits; native billing/approved program enrollment is a
separate alternative. Public chat has reporting/moderation but no user blocking.
Implement effective blocking through existing social/session owners and verify
pre-UGC terms acceptance for guest/public chat and uploads. Do not remove core
features or label reporting as blocking. Reference current Google policies:
https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
and https://support.google.com/googleplay/android-developer/answer/9876937?hl=en .

PR123's two-page GPS disclosure is live on production at compiled source
`e80d473f17b2`, Hosting `d41966c1156b4857`. It explains real-location visibility
through multiplayer avatars in the existing consent panel and privacy page;
pausing GPS does not erase a position already shared. No GPS/room control rule
changed. All 773 other assets match the preceding qualified release and the
staging/production pair differs only in the three Firebase config outputs.
Desktop/mobile-layout consent/cancel checks and served-byte probes passed;
local CAPTCHA errors were retained, not relabeled as new auth qualification.
Required protected checks and post-merge workflows passed. No Android rebuild,
repeated city tests, provider sweep or full release matrix was run.

Actual Play-installed phone gameplay remains pending. The internal test is
available now; public production still requires complete policy/forms/device
qualification, the genuine closed-test period and Google's approval. Resume
from current evidence without retaking ratings or rebuilding the same package.
