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

PR130 tracks the repair. The corrected AAB is ready, but Play upload/activation
still needs the extension's file URL capability, requested from the owner. Do not
bypass it or relabel a prepared binary as published. Keep the existing package,
Play signing association, tester list and opt-in link. Replace code 3 internally,
then replace the closed Alpha candidate under review as Console permits. No public
production Android rollout is authorized by internal-test publication.

Evidence: `output/research/android-launch-crash-2026-10-25/`, including failed setup,
false-green baseline, source hashes, signed artifacts and final runtime screenshots.
The web and backend releases, player data, assets and rollback packages are unchanged.
