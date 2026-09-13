import fs from 'node:fs/promises';
import {compileQualityCase,shiftedCase,rotatedCase} from './street-quality-core.js';
const results=[];
for(const city of ['monaco','san-francisco']){
 const fixture=JSON.parse(await fs.readFile(new URL(`../../tests/fixtures/streets/${city}-hill-quality.json`,import.meta.url),'utf8'));
 for(const c of [fixture,rotatedCase(fixture),shiftedCase(fixture,51200,-51200)])results.push(compileQualityCase(c).report);
}
for(let i=0;i<results.length;i+=3){const original=results[i],shifted=results[i+2];if(Math.abs(original.area-shifted.area)>.1){shifted.pass=false;shifted.failures.push('translation changed pavement coverage by more than 0.1 square world units');}}
const report={schema:1,pass:results.every(r=>r.pass),evidence:'Production polygon compiler and mesh refinement against captured, resampled elevation. Does not certify full-city loading or visual appearance.',results,requiredBrowserChecks:['street-depth.html: camera sweep','street-quality.html: Monaco and San Francisco fixture renders'],fullCityEvidence:'This command does not run full cities. See docs/streets/STREET_REPAIR_VALIDATION.md for separately dated browser results.'};
await fs.mkdir('output/verification/street-quality',{recursive:true});await fs.writeFile('output/verification/street-quality/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
