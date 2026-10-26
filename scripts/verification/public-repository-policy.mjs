import {execFileSync} from 'node:child_process';

// The public source tree contains product code, source assets, licenses,
// dependency locks, useful tests and contributor documentation. Operator notes
// and generated diagnostic evidence belong in private/ignored storage.
const privateRoots=['docs/architecture-evaluation/','docs/audits/','docs/product-audit/',
  'docs/system-review/','docs/verification/','docs/release-review/','docs/visual-quality/',
  'scripts/architecture-evaluation/'];
const sourceExceptions=new Set([
  'docs/audits/2026-09-16-rdt-restoration/RDT-SPATIAL-LICENSE.txt',
  'docs/visual-quality/assets/ship-surfaces.json',
  'docs/visual-quality/assets/atlantic-explorer-submarine.json',
  'scripts/architecture-evaluation/tooling/package.json',
  'scripts/architecture-evaluation/tooling/package-lock.json'
]);
const localOnly=new Set(['AGENTS.md','CURRENT-STATE.md','progress.md',
  'docs/streets/baseline-probes.json','docs/streets/street-system-inventory.json',
  'scripts/verification/deploy-portal-staging.mjs',
  'scripts/verification/portal-native-ci-identity.mjs',
  'scripts/verification/portal-native-live-staging.mjs',
  'scripts/verification/analyze-private-heap.mjs']);
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean);
if(files.length<100)throw Error('Refusing to verify an empty or unrelated Git index.');
const rejected=files.filter(file=>{
  if(sourceExceptions.has(file))return false;
  return localOnly.has(file)||privateRoots.some(root=>file.startsWith(root))||
    /^docs\/streets\/(audit|validation|evidence)[^/]*\//.test(file)||
    /^(output|dist|public|_site|test-results|coverage|node_modules|\.firebase|\.playwright-cli|\.local-candidates|android-artifacts|android-widget-evidence|android-launch-evidence|apple-portal-evidence)\//.test(file)||
    /(^|\/)node_modules\//.test(file)||/\.private\./i.test(file)||/(^|\/)native-acceptance\.json$/.test(file)||
    /\.(jks|keystore|p8|p12|pfx|mobileprovision|apk|aab|ipa|xcresult|heapsnapshot)$/i.test(file)||
    /(^|\/)\.env(?:\.[^/]*)?$/.test(file)&&!file.endsWith('/.env.example')&&file!=='.env.example';
});
if(rejected.length){console.error(JSON.stringify({passed:false,unpublishablePaths:rejected},null,2));process.exitCode=1;}
else console.log(JSON.stringify({passed:true,trackedFiles:files.length,scope:'Tracked paths only. Content secrets are checked independently by Gitleaks.'}));
