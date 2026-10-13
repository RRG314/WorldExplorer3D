import path from 'node:path';
import fs from 'node:fs/promises';

// A validation build must never replace dist, a saved candidate, or arbitrary
// user files. Only an empty, non-symlink child of this generated area is allowed.
export async function resolveHostingOutput(root, requested, {building=false}={}) {
  if(!requested)return path.join(root,'dist');
  if(!/^output\/hosting-validation\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(requested))throw Error('Validation output must be output/hosting-validation/<name>');
  let current=root;
  for(const part of requested.split('/')){
    current=path.join(current,part);
    const stat=await fs.lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(stat&&(stat.isSymbolicLink()||!stat.isDirectory()))throw Error('Validation output must not contain symlinks or files');
  }
  if(building){
    const entries=await fs.readdir(current).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    if(entries.length)throw Error('Validation output already contains files; preserve or explicitly retire it first');
  }
  return current;
}
