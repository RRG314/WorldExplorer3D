#!/usr/bin/env node
// Keep the durable upload credential on the owner's machine, never in CI or dist.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/android-sign-release.mjs <downloaded-artifact-directory>');
const source = path.resolve(input);
const privateRoot = path.join(os.homedir(), 'Library/Application Support/WorldExplorer3D/android-signing');
const credentialPath = path.join(privateRoot, 'upload-credential.json');
const keyPath = path.join(privateRoot, 'world-explorer-upload.p12');
const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21';
const javaTool = name => path.join(javaHome, 'bin', name);
const run = (name,args,env={}) => execFileSync(javaTool(name),args,
  {env:{...process.env,...env},stdio:'pipe',encoding:'utf8'});
await fs.mkdir(privateRoot,{recursive:true,mode:0o700});
await fs.chmod(privateRoot,0o700);
let credential;
try { credential=JSON.parse(await fs.readFile(credentialPath,'utf8')); }
catch(error) {
  if(error.code!=='ENOENT') throw error;
  // Never replace an existing key if its credential has been moved or lost.
  try { await fs.access(keyPath); throw new Error('Existing upload key needs its original credential restored'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  credential={alias:'upload',password:randomBytes(32).toString('hex')};
  await fs.writeFile(credentialPath,JSON.stringify(credential)+'\n',{mode:0o600,flag:'wx'});
  run('keytool',['-genkeypair','-keystore',keyPath,'-storetype','PKCS12','-alias',credential.alias,
    '-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000',
    '-dname','CN=World Explorer 3D Upload','-storepass:env','WE3D_ANDROID_STORE_PASSWORD',
    '-keypass:env','WE3D_ANDROID_STORE_PASSWORD'],{WE3D_ANDROID_STORE_PASSWORD:credential.password});
  await fs.chmod(keyPath,0o600);
}
for(const file of [credentialPath,keyPath]) {
  const stat=await fs.lstat(file);
  if(!stat.isFile() || stat.isSymbolicLink() || (stat.mode&0o077)) throw new Error('Signing files must be private regular files');
}
const signingEnv={WE3D_ANDROID_STORE_PASSWORD:credential.password};
const cert=execFileSync(javaTool('keytool'),['-exportcert','-keystore',keyPath,
  '-alias',credential.alias,'-storepass:env','WE3D_ANDROID_STORE_PASSWORD'],{env:{...process.env,...signingEnv}});
const fingerprint=createHash('sha256').update(cert).digest('hex').toUpperCase().match(/../g).join(':');
const output=path.join(source,'signed');
await fs.mkdir(output,{recursive:true});
const bundle=path.join(output,'world-explorer-5.6.1-test.1.aab');
const apk=path.join(output,'world-explorer-5.6.1-test.1.apk');
// The bundle signature is the upload signature. Google Play uses its own app-signing key.
await fs.copyFile(path.join(source,'app-release.aab'),bundle);
run('jarsigner',['-keystore',keyPath,'-storepass:env','WE3D_ANDROID_STORE_PASSWORD',
  '-keypass:env','WE3D_ANDROID_STORE_PASSWORD','-sigalg','SHA256withRSA','-digestalg','SHA-256',bundle,credential.alias],signingEnv);
run('jarsigner',['-verify',bundle]);
run('java',['-jar',path.join(source,'apksigner.jar'),'sign','--ks',keyPath,
  '--ks-key-alias',credential.alias,'--ks-pass','env:WE3D_ANDROID_STORE_PASSWORD',
  '--key-pass','env:WE3D_ANDROID_STORE_PASSWORD','--out',apk,path.join(source,'app-release-unsigned.apk')],signingEnv);
const apkVerification=run('java',['-jar',path.join(source,'apksigner.jar'),'verify','--verbose','--print-certs',apk]);
if(!apkVerification.includes('Verified using v2 scheme (APK Signature Scheme v2): true')) throw new Error('APK v2 signature missing');
const artifacts=[];
for(const file of [bundle,apk]) {
  const data=await fs.readFile(file);
  artifacts.push({file:path.basename(file),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
await fs.writeFile(path.join(output,'upload-certificate.der'),cert);
const receipt={packageName:'io.worldexplorer3d.app',versionCode:1,versionName:'5.6.1-test.1',
  uploadCertificateSha256:fingerprint,sourceCommit:(await fs.readFile(path.join(source,'source-commit.txt'),'utf8')).trim(),
  artifacts,apkVerification,appSigningCertificate:'Obtain separately from Google Play; upload signature is not the Play app signature'};
await fs.writeFile(path.join(output,'signing-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({packageName:receipt.packageName,sourceCommit:receipt.sourceCommit,uploadCertificateSha256:fingerprint,artifacts},null,2));
