"""Read-only lexical repository census. Candidates are not proof of reachability or runtime verification."""
from pathlib import Path
import subprocess,re,json,collections,os
root=Path.cwd();out=root/'output/research/career-world-20261105';out.mkdir(parents=True,exist_ok=True)
if os.environ.get('GIT_WORK_TREE') != str(root) or not os.environ.get('GIT_DIR') or not os.environ.get('GIT_INDEX_FILE'):
 raise SystemExit('Set the canonical Git environment from CURRENT-STATE.md before this read-only census.')
files=subprocess.check_output(['git','ls-files','-z'],text=True).split('\0');files=[f for f in files if f]
tests=[f for f in files if f.startswith('tests/') and f.endswith(('.js','.mjs','.cjs'))]
records=[];groups=collections.Counter();extensions=collections.Counter();total=0
for name in files:
 p=root/name;extensions[p.suffix]+=1
 if not name.startswith(('app/js/','js/','account/','functions/','services/','android/','ios/','widgets/','native/')) or p.suffix not in ('.js','.mjs','.cjs','.ts','.kt','.swift','.java'):continue
 if any(x in p.parts for x in ['node_modules','vendor','build','dist']):continue
 try:s=p.read_text()
 except (OSError,UnicodeError):continue
 group='/'.join(name.split('/')[:3] if name.startswith('app/js/') else name.split('/')[:2]);groups[group]+=1;total+=len(s.splitlines())
 imports=[]
 for m in re.finditer(r'''(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\))''',s):
  spec=next(x for x in m.groups() if x is not None);target=None
  if spec.startswith('.'):
   try:target=str((p.parent/spec.split('?')[0]).resolve().relative_to(root))
   except ValueError:pass
  imports.append({'specifier':spec,'target':target,'dynamic':m.group(2) is not None})
 records.append({'path':name,'lines':len(s.splitlines()),'bytes':p.stat().st_size,'imports':imports,'dom':len(re.findall(r'\b(?:document|window)\.',s)),'three':len(re.findall(r'\bTHREE\.',s)),'localStorage':len(re.findall(r'localStorage\.',s)),'indexedDB':bool(re.search(r'indexedDB|\.transaction\(',s)),'fetch':len(re.findall(r'\bfetch\(',s)),'uiIds':sorted(set(re.findall(r'getElementById\([\'"]([^\'"]+)',s))),'stateWrites':sorted(set(re.findall(r'(?:appCtx|ctx|runtime)\.([A-Za-z_$][\w$]*)\s*=(?!=)',s))),'exports':re.findall(r'export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)',s),'testCandidates':[f for f in tests if Path(name).stem in Path(f).stem][:20]})
report={'method':'Lexical tracked-source census; import/comment/computed-path limitations. Test filename matches are candidates only. All grouped modules indexed; detailed manual traces are limited to documented boundaries. No module declared absent/dead on this evidence.','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'trackedFiles':len(files),'modules':len(records),'lines':total,'testFiles':len(tests),'extensions':dict(extensions),'groups':dict(sorted(groups.items())),'records':records}
(out/'source-census.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Source census','',report['method'],'',f"Baseline `{report['head']}`: {len(files):,} tracked files; {len(records):,} indexed runtime/backend/platform source modules; {total:,} lines. {len(tests):,} candidate test files (not a pass count). Generated/vendor distinctions and source-level status remain explicit.",'','| Group | Modules |','| --- | ---: |']+[f'| `{k}` | {v} |' for k,v in sorted(groups.items())]
(root/'docs/career-world-integration/SOURCE_CENSUS.md').write_text('\n'.join(lines)+'\n\nFull local records: output/research/career-world-20261105/source-census.json. The reviewed gameplay/authority inventories identify actual owners, entry paths and evidence; this census does not claim a manual line-by-line audit.\n')
print(json.dumps({k:report[k] for k in ['head','trackedFiles','modules','lines','testFiles']},indent=2))
