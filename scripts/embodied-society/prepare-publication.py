#!/usr/bin/env python3
"""Build a reviewed public Git tree without checking out, copying or pushing it.
The private development branch/history and working index are untouched.
"""
import hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PUBLIC_DOCS={
 'docs/EMBODIED_AGENT_SOCIETY_EXPERIMENT.md','docs/EMBODIED_AI_FREE_START.md',
 'docs/SYSTEM_REPORT_2026-09-11.md','docs/PROJECT_DESCRIPTION.md',
 'docs/SYSTEM_INVENTORY.md','docs/ARCHITECTURE_MAP.md',
 'docs/SYSTEM_INVENTORY_REFERENCE.md','docs/RELEASE_REPAIR_PROGRAM.md',
 'docs/audits/2026-09-10/README.md','docs/audits/2026-09-10/tests-and-evidence.md',
 'docs/audits/2026-09-10/repair-plan.md','docs/audits/2026-09-10/architecture-and-inventory.md',
}
EXCLUDE={'docs/CAPTURE_PUBLICATION_AND_NOTIFICATIONS.md','docs/RELEASE_SOURCE_OF_TRUTH.md','docs/TRANSPORT_LOCAL_CHECKPOINT.md','.firebaserc','firebase.json','config/firebase.production.json','config/firebase.staging.json','js/firebase-project-config.js'}
WORKFLOWS={'.github/workflows/research-verify.yml','.github/workflows/secret-scan.yml'}
def git(*args,data=None,env=None):
 return subprocess.check_output(['git',*args],cwd=ROOT,input=data,env=env)
def entries(ref):
 result={}
 for line in git('ls-tree','-rz',ref).split(b'\0'):
  if not line:continue
  meta,name=line.split(b'\t',1);mode,kind,sha=meta.decode().split()
  result[name.decode()]=(mode,sha)
 return result

def main():
 baseline=git('rev-parse','origin/stable').decode().strip()
 source=git('rev-parse','HEAD').decode().strip()
 current=entries('HEAD');public=entries(baseline);omitted=[];restored=[];sanitized=[]
 for name in list(current):
  if name in EXCLUDE or (name.startswith('.github/workflows/') and name not in WORKFLOWS):
   current.pop(name);omitted.append(name)
  elif name.startswith('docs/') and name not in PUBLIC_DOCS:
   if name in public:
    if current[name]!=public[name]:restored.append(name)
    current[name]=public[name]
   else:current.pop(name);omitted.append(name)
 # Explicit public documentation edits only; no regex rewriting runtime logic.
 for name in list(current):
  if name in PUBLIC_DOCS:
   mode,sha=current[name];s=git('cat-file','blob',sha).decode()
   s=re.sub(r'^\*\*Workspace:\*\*.*\n','',s,flags=re.M)
   s=s.replace(str(ROOT),'.')
   s=re.sub(r'/Users/[^\s`\)\]<>]+','<local-path>',s)
   if re.search(r'[\w.+-]+@(?:gmail|yahoo|hotmail|outlook)\.com',s,re.I):
    raise ValueError('Personal email in reviewed public document: '+name)
   b=s.encode();newsha=git('hash-object','-w','--stdin',data=b).decode().strip()
   if newsha!=sha:sanitized.append(name)
   current[name]=(mode,newsha)
 public_agents='''# Research working policy\n\nWork only on the research branch. Do not deploy or modify production. Run one bounded task at a time; do not start browsers, emulators or provider calls as part of documentation checks. Keep keys, raw run outputs, user records and personal paths private. Preserve failed evidence. Read research/embodied-society/README.md and GOVERNANCE.md before changing experiments.\n'''
 public_readme='''# World Explorer 3D — embodied-agent research\n\nThis is the separate research branch, not the live application release. It includes the mapped-world environment required to run the resident locally. No production deployment configuration or deployment workflow is included.\n\nStart with the [research program and current status](research/embodied-society/README.md). The [technical paper](research/embodied-society/papers/pilot-technical-report.md) explains the architecture, methods, prior work and actual findings. The [prospective protocol](research/embodied-society/PROTOCOL.md) defines what the next study must measure. The [results inventory](research/embodied-society/RESULTS.md) preserves unsuccessful attempts as well as the live gathering result.\n\n**Demonstrated:** Gemini selected movement, finite-resource gathering and eating with a measured need increase in the actual mapped world. **Still unproven:** sustained survival, live crafting/building and society. This is a developmental pilot and an unreviewed technical report, not a claim of artificial human life or a finished benchmark.\n\nFor verification and local execution, use the [reproduction guide](research/embodied-society/REPRODUCIBILITY.md). For data interpretation and privacy, read the [recordkeeping specification](research/embodied-society/DATA.md). For the larger application, see the [system and architecture report](docs/SYSTEM_REPORT_2026-09-11.md). [Research acknowledgements](research/embodied-society/ACKNOWLEDGEMENTS.md), [citation metadata](CITATION.cff), [license](LICENSE) and [third-party attribution](ATTRIBUTION.md) are part of the release.\n\nThis public snapshot starts its own history to avoid exposing private development commits. The application is retained as an environment dependency; the research code and documents have separate directories. Publishing here does not merge into stable or main. See [publication boundaries](research/embodied-society/PUBLICATION.md).\n'''
 for name,s in [('AGENTS.md',public_agents),('README.md',public_readme)]:
  current[name]=('100644',git('hash-object','-w','--stdin',data=s.encode()).decode().strip());sanitized.append(name)
 report={'schemaVersion':1,'sourceCheckpoint':source,'publicBaseline':baseline,'historyPolicy':'root snapshot; no private ancestors','omittedFiles':sorted(omitted),'baselineDocumentRestorations':sorted(restored),'sanitizedFiles':sorted(sanitized),'fileCountExcludingThisManifest':len(current),'deploymentsEnabled':False}
 manifest=json.dumps(report,indent=2,sort_keys=True).encode()+b'\n'
 current['research/embodied-society/publication-manifest.json']=('100644',git('hash-object','-w','--stdin',data=manifest).decode().strip())
 # An isolated index reuses existing Git blobs; it does not copy app/assets.
 with tempfile.TemporaryDirectory(prefix='we3d-public-index-') as tmp:
  env={**os.environ,'GIT_INDEX_FILE':str(Path(tmp)/'index')}
  git('read-tree','--empty',env=env)
  data=b''.join(f'{mode} {sha}\t{name}\0'.encode() for name,(mode,sha) in sorted(current.items()))
  git('update-index','-z','--index-info',data=data,env=env)
  tree=git('write-tree',env=env).decode().strip()
 print(json.dumps({'tree':tree,'sourceCheckpoint':source,'publicBaseline':baseline,'files':len(current),'omitted':len(omitted),'sanitized':len(sanitized)}))
if __name__=='__main__':main()
