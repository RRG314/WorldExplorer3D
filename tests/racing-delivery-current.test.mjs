import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
test('racing browser endpoints have same-origin Hosting routes to their matching Functions',async()=>{
 const source=await fs.readFile(new URL('../app/js/racing/service-client.js',import.meta.url),'utf8'),config=JSON.parse(await fs.readFile(new URL('../firebase.json',import.meta.url),'utf8'));
 const endpoints=[...source.matchAll(/postProtectedFunction\('([^']+)'/g)].map(m=>m[1]);assert.ok(endpoints.length>=8);
 for(const name of endpoints){const matches=config.hosting.rewrites.filter(r=>r.source==='/'+name);assert.equal(matches.length,1,name+' must have one unambiguous Hosting route');assert.equal(matches[0].function,name);}
});
