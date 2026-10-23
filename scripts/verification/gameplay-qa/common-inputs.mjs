import fs from 'node:fs/promises';
import path from 'node:path';

export async function commonGameplayInputs(root) {
  const directory=path.join(root,'app/js');
  const entries=await fs.readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  const roots=entries.filter(e=>e.isFile()&&e.name.endsWith('.js')).map(e=>'app/js/'+e.name);
  const candidates=['app/js/modules','app/js/physics','app/js/hud','app/js/runtime','app/js/controls','app/js/engine','app/js/assets','app/js/ui/globe-selector.js','app/js/ui/globe-selector','app/js/ui/title-screen','js/firebase-init.js','js/firebase-project-config.js','js/function-api.js','js/auth-ui.js'];
  for(const candidate of candidates)if(await fs.stat(path.join(root,candidate)).catch(()=>null))roots.push(candidate);
  return roots.sort();
}
