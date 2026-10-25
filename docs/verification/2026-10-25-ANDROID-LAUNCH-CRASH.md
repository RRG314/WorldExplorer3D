# Android launcher crash repair — October 25, 2026

The owner reported Android's repeated "keeps stopping" dialog on a Motorola g
play (model/year approximate; Android version unconfirmed). Play Vitals had no
current trace and no pre-launch report existed. Current native code, not historical
notes, was checked against the signed version 3 source and reproduced remotely.

## Cause and change

Browser Helper 2.7.4's `LauncherActivity.launchTwa()` always calls
`ManageDataLauncherActivity.addSiteSettingsShortcut()`. Its enabled and disabled
paths both use PackageManager's component-setting API. The app omitted that
activity, so connected startup throws `IllegalArgumentException: Component class
com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity does not exist
in io.worldexplorer3d.app`. The exception precedes game loading and browser origin
validation. Source: the pinned library's [launcher](https://github.com/GoogleChrome/android-browser-helper/blob/android-browser-helper-2.7.4/androidbrowserhelper/src/main/java/com/google/androidbrowserhelper/trusted/LauncherActivity.java)
and [settings activity](https://github.com/GoogleChrome/android-browser-helper/blob/android-browser-helper-2.7.4/androidbrowserhelper/src/main/java/com/google/androidbrowserhelper/trusted/ManageDataLauncherActivity.java).

Declare the private activity, its canonical MANAGE_SPACE_URL and application's
manageSpaceActivity using the existing library. Increment to code 4/name
5.6.1-test.4. Do not weaken intent/origin validation, catch and hide startup
exceptions, change permissions or move browser/save ownership.

## Evidence and limits

- Initial tracked tree clean at 4bbac287; native manifest/launcher/Gradle bytes
  matched the version 3 source and diagnostic commits. Disk reserve checked.
- Diagnostic run 40161618452 never exercised the app: Android tools disagreed
  about the AVD directory. Cancelled with evidence retained. The corrected setup
  uses explicit shared directories and bounded setup/cleanup waits.
- Diagnostic run 40162371070 captured the actual version 3 fatal startup exception.
  Its green workflow conclusion was false: `rg: command not found` in a shell
  conditional did not fail the job. The home-screen screenshot and native stack
  are retained. **This is a failing reproduction, not accepted verification.**
- The Node checker rejects that retained full log, a crash fixture and a silent
  return home. Three focused regressions pass. Offline acceptance requires its
  title/retry control and native foreground; online acceptance requires browser
  foreground, Play launch URL and no fatal process exception.
- Native candidate 1e644245ba11df70059954c2f6a92134a35128b7, workflow
  40162826077: compile/lint, release APK/AAB creation and all four emulator phases
  passed. The runtime APK uses release bytecode and an ephemeral CI signing key;
  the distributed AAB uses the existing private upload key. API35/Android15 is
  not asserted to match the owner's exact OS.
- Inspected online/offline screenshots and retained UI/activity/log files. Chrome
  handoff reaches its first-run screen; Chrome terms were not accepted. This is
  native launch/retry acceptance, **not web gameplay, verified fullscreen, Play
  delivery or physical-phone acceptance**. No world/game release matrix rerun.
- Initial PR check failed because the new checker tests lacked an inventory owner;
  add them to the existing component list. Retain the failed run. Later docs/list
  changes do not rebuild the unchanged native package.

Signed AAB: `world-explorer-5.6.1-test.4.aab`, 3,604,692 bytes,
SHA-256 `8f8595385fa25821449341ec83adfc4c2715fc258bf540ece8e4f1da2e203a55`.
Native version 3 and every earlier artifact remain retained.

## Delivery boundary

PR130 passed its required checks and merged as
`8e33229d96dac0ebb1c119b93fb0eeda32c0cf92` using the repository's required squash
method; the reviewed head and merge trees match. All four post-merge workflows
passed. After the owner enabled extension file URL access, the exact signed bundle
was rehashed and uploaded without a rebuild. Google accepted it and confirmed
internal version 4 Active / Available to internal testers on October 25 at 9:09 AM
Eastern. Code 3 is excluded. The existing package, Play signing association, tester
selection and opt-in link are preserved, and device support is unchanged. The only
warning is a missing deobfuscation map; this release has minifyEnabled false and
does not generate one. Google says updates usually appear within an hour,
occasionally longer. No physical-phone acceptance or public Android rollout is
implied. The owner was asked to update and confirm the Motorola launch.

A later fresh Console read found closed Alpha code 3 was already available to
selected testers, released October 24 at 8:47 PM. Submitted its pause as the only
publishing change. A fresh later read confirms This track is paused / Inactive.
Added the same code 4 from the existing bundle library and excluded code 3.
Submitted the replacement and track resumption together; existing lists, history,
regions and content declarations are preserved. Google confirms Changes in review
for four changes: code 4 rollout, resume, full description and phone screenshots.
Closed review approval is pending. Do not ask the owner to reinstall broken code 3
or use the upload-key APK as a Play update.

The file capability also unblocked the previously requested eight screenshots.
Rehashed the existing unedited gameplay selection; uploaded and saved all eight
at 1920x1080/16:9, replacing the two menu screenshots. Review UI confirmed all eight
filenames. The saved full description retains accurate selected-location defaults,
finite Earth transport, experimental extended scenery, browser storage and content
disclosures; no unsupported streaming claim was introduced. AI labels remain only
on the existing icon and feature graphic; all eight gameplay checkboxes are off.
The gallery order accepted by Console is spaceflight, submarine, Mars, research
vessel, Baltimore aircraft, Baltimore driving, Las Vegas and Monaco. Original PNGs
and earlier listing evidence remain. An initial chooser wait opened the asset
library instead; its visible Upload control then succeeded. A temporary CDP timeout
was inspected and retried before submission. Neither was a new game test failure.

Latest receipt: `play-version-4-delivery.json` in the evidence folder. Earlier
`final-delivery.json` records the earlier blocked state and remains historical.

Evidence: `output/research/android-launch-crash-2026-10-25/`, including failed setup,
false-green baseline, source hashes, signed artifacts and final runtime screenshots.
The web and backend releases, player data, assets and rollback packages are unchanged.

## Owner device follow-up

October 25: the owner confirms the Play update installed and the game opened on
the Motorola. This closes the reported native startup failure on that device.
Their subsequent difficult car-steering report is a separate game-input issue;
no all-mode phone performance or sensor acceptance is inferred.
