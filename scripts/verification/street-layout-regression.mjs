import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {replayStreetLayout} from './street-layout-replay.mjs';

// Reuse the captured source snapshots; no browser, provider requests or new
// world copies. The scope is each entire saved resident extent, not a city.
const cases=[
  ['Baltimore','baltimore-geometric-corners-layout.json','8ff6dfefa90356cbde9158fad070befe045d1c56d0c1d297b0f7e73482a26126'],
  ['Monaco','monaco-frontage-layout.json','2006e3ba118f9f8c7cbddfed7ab0739eec12663efaac26fae38cbcfb68e647fe'],
  ['San Francisco','sf-single-partition-layout.json','0bb49c30ca3dade04c2fa593cc7212bf82f6171391bab91f83a8574fab0543c3']
];
const reports=[];
for(const [name,file,expectedHash] of cases){
  const source=await readFile(new URL(`../../tests/fixtures/street-geometry/${file}`,import.meta.url),'utf8');
  const hash=createHash('sha256').update(source).digest('hex');
  if(hash!==expectedHash)throw new Error(`${name} source capture changed; review and deliberately update its pinned hash before using a new baseline`);
  const replay=replayStreetLayout(JSON.parse(source));
  const pass=replay.reports.every(r=>r.beyondRoundingArea<=1e-5);
  reports.push({name,file,sha256:hash,pass,coverageBounds:replay.coverageBounds,sourceCounts:replay.sourceCounts,
    reports:replay.reports.map(({differences,...r})=>r)});
  console.log(`${pass?'PASS':'FAIL'} ${name}: entire saved extent, output sizes ${replay.reports.map(r=>r.chunkSize).join('/')}; beyond-allowance area ${replay.reports.map(r=>r.beyondRoundingArea).join('/')}`);
}
console.log(JSON.stringify({scope:'Saved resident source extents; horizontal packaging invariance. Does not certify source completeness, independent heights, movement or whole-city appearance.',boundaryAllowanceWorld:.002,comparisonGridWorld:.000001,reports},null,2));
if(reports.some(r=>!r.pass))process.exitCode=1;
