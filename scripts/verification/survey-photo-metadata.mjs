import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import exifr from 'exifr';
import {normalizeSurveyMetadata} from '../../app/js/reality-capture/survey-metadata.js';
const directories=process.argv.slice(2);
if(!directories.length)throw Error('Pass photo directories explicitly. Originals are read only; nothing is uploaded.');
const records=[],hashes=new Set();let duplicates=0,totalBytes=0;
for(const directory of directories)for(const name of (await readdir(directory)).sort()){
  if(!/\.(jpe?g|png|webp|heic|heif)$/i.test(name))continue;
  const bytes=await readFile(`${directory}/${name}`);totalBytes+=bytes.length;
  const hash=createHash('sha256').update(bytes).digest('hex');if(hashes.has(hash))duplicates++;hashes.add(hash);
  try{const metadata=normalizeSurveyMetadata(await exifr.parse(bytes,{translateValues:false,translateDates:false})||{});
    records.push({name,locationStatus:metadata.locationStatus,hasHeading:!!metadata.heading,width:metadata.width,height:metadata.height,assignmentStatus:metadata.assignmentStatus});
  }catch(error){records.push({name,error:'Metadata could not be read',assignmentStatus:'unassigned'});}
}
console.log(JSON.stringify({count:records.length,totalBytes,exactDuplicates:duplicates,located:records.filter(r=>r.locationStatus==='available').length,withHeading:records.filter(r=>r.hasHeading).length,records},null,2));
