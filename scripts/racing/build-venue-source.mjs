#!/usr/bin/env node
// Retain only licensed geographic facts, without mapper account metadata or
// official venue artwork. This is the reproducible ODbL adapted-data recipe.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {compileMappedVenueLayout} from '../../app/js/racing/venue-layout.js';
import {osmVenueIntake} from '../lib/osm-venue-intake.mjs';
const flag=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const configPath=flag('--config'),input=flag('--input'),output=flag('--output');
if(!configPath||!input||!output)throw Error('--config=FILE --input=RAW_OSM_RESPONSE --output=NEW_FILE required');
if(await fs.stat(output).catch(()=>null))throw Error('venue_source_output_already_exists');
const config=JSON.parse(await fs.readFile(configPath)),bytes=await fs.readFile(input),raw=JSON.parse(bytes);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
if(hash(bytes)!==config.source.responseSha256)throw Error('venue_raw_source_integrity');
const {ways,snapshot}=osmVenueIntake(raw,config.source);
const source={schemaVersion:1,venueId:config.venueId,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',
 source:{...config.source,...snapshot,recipe:'scripts/racing/build-venue-source.mjs'},layout:config.layout,ways};
const compiled=compileMappedVenueLayout(source),text=JSON.stringify(source)+'\n';
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,text);
console.log(JSON.stringify({venueId:source.venueId,ways:ways.length,layoutWays:compiled.wayIds.length,lengthMeters:compiled.lengthMeters,
 referenceLengthMeters:compiled.referenceLengthMeters,lengthDifferenceMeters:compiled.lengthDifferenceMeters,bytes:Buffer.byteLength(text),contentSha256:hash(text)}));
