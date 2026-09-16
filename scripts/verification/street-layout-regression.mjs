import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {replayStreetLayout} from './street-layout-replay.mjs';

// Reuse the captured source snapshots; no browser, provider requests or new
// world copies. The scope is each entire saved resident extent, not a city.
const cases=[
  ['Baltimore','baltimore-geometric-corners-layout.json','7c576aa427adcfddda108f70fba7b5348cb341015f00cf64ff311c7c5f926a7d'],
  ['Monaco','monaco-frontage-layout.json','34b392b7694f1218b2825142c92533f2b0c9eb3a098b0eab37055e1c0e5aceb7'],
  ['San Francisco','sf-single-partition-layout.json','4ce3e9887c35c17029aaf0a9ed4dfc4ca2a4db531d40c8a18d9d1b9fbe9d1067']
];
const reports=[];
for(const [name,file,expectedHash] of cases){
  const source=await readFile(new URL(`../../docs/streets/audit-2026-09-13/${file}`,import.meta.url),'utf8');
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
