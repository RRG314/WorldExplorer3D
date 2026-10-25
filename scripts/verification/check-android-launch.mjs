import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// adb's successful am-start response does not mean onCreate survived. Check
// retained runtime evidence and the foreground screen, not the command's exit.
export function checkLaunch(log, activities, ui, phase) {
  assert.match(log, /io\.worldexplorer3d\.app/, 'No World Explorer runtime evidence');
  assert.doesNotMatch(log, /AndroidRuntime: Process: io\.worldexplorer3d\.app(?:,|:)/,
    'World Explorer crashed; inspect the retained AndroidRuntime stack');
  assert.doesNotMatch(log, /FATAL EXCEPTION/, 'A process crashed during the launch journey');
  if (phase === 'offline') {
    assert.match(activities, /topResumedActivity=.*io\.worldexplorer3d\.app/,
      'Offline recovery activity is not foreground');
    assert.match(ui, /Connect to explore/, 'Offline recovery was not displayed');
    assert.match(ui, /retry_connection/, 'Offline recovery has no retry control');
  } else {
    assert.match(activities, /topResumedActivity=.*com\.android\.chrome/,
      'Launch did not hand off to the browser');
    assert.match(log, /worldexplorer3d\.io\/app\/\?distribution=google-play/,
      'Play edition launch URL is missing');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [directory, phase] = process.argv.slice(2);
  assert.ok(directory && ['online', 'offline', 'retry', 'relaunch'].includes(phase));
  const read = name => fs.readFileSync(path.join(directory, `${phase}-${name}`), 'utf8');
  checkLaunch(read('logcat.txt'), read('activities.txt'), read('ui.xml'), phase);
  console.log(`Android ${phase} launch evidence passed`);
}
