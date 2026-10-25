# Android test package

The first Android test runs the released World Explorer 3D browser game using
Google's Android Browser Helper / Trusted Web Activity. This preserves the
existing geographic source, world/session owners, progress and online services.
It is not the future Godot version. Internet access and a compatible current
browser are required. Do not promise unlimited worldwide streaming or offline
world play.

## Build and signing

- Package: `io.worldexplorer3d.app`; published internal code `3`, name `5.6.1-test.3`.
  Codes `1` and `2` remain in history and are excluded from the new release.
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

Version 3 was uploaded, validated and published October 24 at 4:36 PM to active
internal track 4701521177239633849. Only the owner-only World Explorer list is
selected; the unrelated RGE256 list is unselected. The invitation remains
https://play.google.com/apps/internaltest/4701521177239633849 . Acceptance and
installation remain the owner's actions. Google still displays its temporary
unreviewed package label. The saved public name is **World Explorer 3D**.

The upload AAB was rehashed before Console upload: SHA-256
`dfca113d6a2322679e1092e8b5c68831ca62f05982dc0d14e9830c0f9b98c651`.
Build/lint 40129219761 and signature verification passed. Native inputs are from
`3c02db8335d26bc0e56e494363439444846f2506`; the subsequent b48 correction changes
only two web billing imports. Durable signing material was reused and remains
outside the repository. No new key, native bridge, permission or billing SDK.

The consumption-only web presentation and mobile Account fixes are live:

- Production `5.6.1+b48f27561a9c.b114089627016e66.production`, Hosting
  `513b12b8f2df377c`.
- Staging `5.6.1+b48f27561a9c.414b57dc65f2c2f5.staging`, Hosting
  `81cd842af05a2be9`.
- Compiled source `b48f27561a9c751405e0b2b4437391c23763dd8b`; PR125 merged as
  `0bb18f3e1108de89237070f542448a62294337c1`, identical source trees.

Six distribution component tests, ownership and unresolved-name checks,
source-browser navigation/layout and compiled account-gate/room-option checks
passed. Required checks, security scans and all four post-merge workflows passed.
Staging/production differ only in three expected Firebase configuration files;
741 preceding assets remain byte-identical. Exact changed live bytes were checked.
World data, features, coverage, transport admission, existing progress and services
were preserved. Failed CI/import/precondition/overflow attempts and local CAPTCHA/
Firestore errors remain evidence, not new Android or live-auth qualification.

Free pricing and basic declarations are saved, including No advertising ID.
IARC remains Completed: ESRB Teen, PEGI16, USK16, generic/Russia16+, Brazil14+,
South Korea15+, TaiwanPG12, AustraliaPG and Saudi Arabia18. Target audience is
16–17 and 18 and over. Retain the existing truthful violence/medicine/interaction/
location answers; these ratings are not Google app-review approval.

The dedicated empty non-admin reviewer account has complimentary nonexpiring
Pro access. Normal password sign-in/own-profile read passed. Credentials and
reusable instructions are saved with Google; optional partner/device-feedback
sharing is off. There is no purchase, OTP or trial requirement. Private credentials
remain owner-only outside source and evidence. No physical-phone claim.

Store text, icon, feature graphic and two real compiled-app UI screenshots were
saved; Console marked the listing Ready to send for review. Icon/feature graphic
AI assistance was declared. The owner requested gameplay replacement. Prepared
unedited 1920×1080 gameplay PNGs and per-file hashes are in
`output/research/play-gameplay-screenshots-2026-10-24/selected/` and `selection.json`.
That receipt records the latest upload status; prepared images are not proof of
a Console upload. These are Mac Chrome landscape touch-layout captures of compiled
staging b48 through ordinary controls, not physical Android screenshots, render
fixtures or AI images. Failed locations/unresponsive/resource-limited attempts
are retained. No full historical acceptance suite was restarted for photography.

Data safety retains its 16-category/security/account-deletion draft. Per-type
handling/purposes and provider/analytics sharing still require completion; limited
cookieless measurement is not a complete opt-out or proof all collection is optional.
Do not submit unsupported No-data or independent-security-review claims.

Before wider distribution, implement effective player blocking through existing
social/session owners and verify pre-UGC terms acceptance for guest/public chat
and uploads. Reporting/moderation is not persistent blocking. Preserve account
removal cleanup. The implemented consumption-only presentation is not a Google
policy approval. Actual Play-installed phone checks, final accurate forms and
12 genuine continuously opted-in closed testers for 14 days remain outstanding.

Operational evidence and failed attempts:
`output/research/play-completion-2026-10-24/` and
`output/research/play-gameplay-screenshots-2026-10-24/`.
The preceding GPS disclosure remains in the current release. Original dist,
rollback bases, assets, history, player data and all evidence remain preserved;
identical bytes now share APFS copy-on-write storage with hash receipts. Do not
repeat builds for documentation-only changes or relabel Mac evidence as phone
performance. No public Android production rollout or broad tester mailing occurred.


## October 24 location-default/community candidate follow-up

The selected-location default, optional world exploration controls, pre-community
terms acceptance and persistent chat/invitation blocking are implemented and
focused local checks passed. See `docs/verification/2026-10-24-LOCATION-DEFAULT-COMMUNITY.md`
and the latest CURRENT-STATE section for exact scope and activation status.
No native source changed: signed Android code 3 remains the reusable internal/
closed-test binary; the TWA consumes the coordinated hosted web update.

Data safety handling/purposes are now saved for all 16 selected types. Independent
provider sharing, required limited diagnostics/measurement, optional GPS, social
and uploads are distinguished; no ad/independent-audit claim was added. Analytics
Data Processing Terms were accepted with the owner's explicit authorization.
Free pricing is confirmed by App pricing. Closed Alpha's existing World Explorer
one-owner list and feedback mailbox are saved. No broad mailing or fake testers.

The gameplay pack is prepared but file upload is blocked by the extension's
file-URL permission. The owner has not installed code 3 yet. Actual Android
installation/auth/resume/touch/progress/room checks and Google's real closed-test
period remain outstanding; browser component checks are not substitutes.


The initial location-default/community release is live through protected PR127;
CURRENT-STATE and its verification record contain exact web/server identities.
The later four-line account social-state cleanup changes only frontend inputs.
Google registered `io.worldexplorer3d.app` with its existing Play signing key.
Closed Alpha reuses code 3; the World Explorer owner-only list, feedback mailbox
and 177 regions are configured. Its first review uses the two already saved,
accurate compiled UI images. The eight gameplay replacements still require the
extension's file URL access. Do not claim they were uploaded.

For real testers: approving an application in the World Explorer admin portal
sends the existing consented mail workflow but does not automatically modify Play
email lists. Add their Google Play account emails to the selected World Explorer
list before sending the closed-test opt-in URL. The existing owner internal link
is immediately usable. Preserve 24-hour confirmation links and the already
verified production email flow; do not resend its test messages for this web edit.


Google now shows **Changes in review** for the 15-change closed Alpha submission,
including code 3, current listing, Data safety and content declarations. Package
and signing-certificate registration is Registered. No review approval, public
production access or physical Android acceptance is claimed. Final frontend
cleanup delivery receipts are in the location-default operational folder; no
new Android binary is required.
