import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkLaunch} from '../scripts/verification/check-android-launch.mjs';

test('an am-start success cannot hide the observed missing-component crash', () => {
  const log = 'D TWALauncherActivity: https://worldexplorer3d.io/app/?distribution=google-play\nE AndroidRuntime: FATAL EXCEPTION: main\nE AndroidRuntime: Process: io.worldexplorer3d.app, PID: 2633\njava.lang.IllegalArgumentException: Component class com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity does not exist';
  assert.throws(() => checkLaunch(log, 'topResumedActivity=com.android.chrome', '', 'online'), /crashed/);
});

test('a silent return to the home screen cannot pass the launch check', () => {
  const log = 'io.worldexplorer3d.app https://worldexplorer3d.io/app/?distribution=google-play';
  assert.throws(() => checkLaunch(log, 'topResumedActivity=com.google.android.apps.nexuslauncher', '', 'online'), /hand off/);
});

test('browser handoff and offline recovery require their own foreground evidence', () => {
  const log = 'io.worldexplorer3d.app https://worldexplorer3d.io/app/?distribution=google-play';
  checkLaunch(log, 'topResumedActivity=com.android.chrome', '', 'online');
  assert.throws(() => checkLaunch(log, 'topResumedActivity=io.worldexplorer3d.app', '', 'offline'), /not displayed/);
  checkLaunch(log, 'topResumedActivity=io.worldexplorer3d.app', '<node text="Connect to explore" resource-id="io.worldexplorer3d.app:id/retry_connection"/>', 'offline');
});
