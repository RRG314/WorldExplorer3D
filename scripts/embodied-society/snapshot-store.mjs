import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

// Local operator storage, not an OS sandbox or a cloud database. A single
// workshop service owns each directory; multi-process writers are unsupported.
export function createSnapshotStore(directory, { maxBytes = 1024 * 1024 } = {}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new Error('Invalid snapshot byte budget.');
  const destination=path.join(directory,'workshop.json');
  let queue=Promise.resolve();
  return {
    async load() {
      try {
        const file=await open(destination,'r');
        try {if((await file.stat()).size>maxBytes)throw new Error('Snapshot byte budget exceeded.');return JSON.parse(await file.readFile('utf8'));}
        finally{await file.close();}
      } catch(error){if(error.code==='ENOENT')return null;throw error;}
    },
    save(state) {
      const data=JSON.stringify(state);if(Buffer.byteLength(data)>maxBytes)return Promise.reject(new Error('Snapshot byte budget exceeded.'));
      const work=queue.then(async()=>{
        await mkdir(directory,{recursive:true,mode:0o700});
        const temporary=path.join(directory,`workshop-${process.pid}.tmp`);
        let file;
        try {
          file=await open(temporary,'wx',0o600);await file.writeFile(data);await file.sync();await file.close();file=null;
          await rename(temporary,destination);
        } finally {
          if(file)await file.close();
          await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
        }
      });queue=work.catch(()=>{});return work;
    }
  };
}
