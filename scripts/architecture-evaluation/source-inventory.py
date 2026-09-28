"""Read-only source evidence, not a runtime cost estimator. Run from repository root."""
import pathlib,re,json,subprocess
root=pathlib.Path.cwd(); out=root/'docs/architecture-evaluation/evidence';out.mkdir(parents=True,exist_ok=True)
files=sorted([*root.glob('app/js/**/*.js'),*root.glob('js/**/*.js')]); records={}; edges={}; variants={}
for p in files:
 s=p.read_text(); key=str(p.relative_to(root)); imports=[]
 for m in re.finditer(r'''(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\))''',s):
  spec=m.group(1) or m.group(2); dynamic=m.group(2) is not None
  if not spec.startswith('.'): continue
  target=(p.parent/spec.split('?')[0]).resolve()
  try: dest=str(target.relative_to(root))
  except ValueError: continue
  imports.append({'target':dest,'dynamic':dynamic,'specifier':spec});variants.setdefault(dest,set()).add(spec.split('?')[1] if '?' in spec else '')
 edges[key]=imports
 records[key]={'bytes':p.stat().st_size,'lines':len(s.splitlines()),'imports':len(imports),'sharedContext':bool(re.search(r'import.*shared-context',s)), 'threeReferences':len(re.findall(r'\bTHREE\.',s)), 'domReferences':len(re.findall(r'\b(?:document|window)\.',s))}
def reach(entry):
 seen=set(); stack=[entry]
 while stack:
  key=stack.pop()
  if key in seen or key not in records: continue
  seen.add(key); stack.extend(e['target'] for e in edges[key] if not e['dynamic'])
 return sorted(seen)
entry=reach('app/js/app-entry.js')
report={'method':'Lexical import scan; literal imports only; comments/computed imports can affect results. Source bytes are not network transfer, parse time, or heap. Entrypoint closure is a static estimate, not browser evidence.','head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'modules':len(records),'sourceBytes':sum(x['bytes'] for x in records.values()),'sharedContextImportModules':sum(x['sharedContext'] for x in records.values()),'threeReferenceModules':sum(x['threeReferences']>0 for x in records.values()),'domReferenceModules':sum(x['domReferences']>0 for x in records.values()),'entryStaticModuleCount':len(entry),'entryStaticSourceBytes':sum(records[k]['bytes'] for k in entry),'largestModules':sorted(records.items(),key=lambda kv:kv[1]['bytes'],reverse=True)[:20],'queryVariants':{k:sorted(v) for k,v in variants.items() if len(v)>1},'entryStaticModules':entry,'records':records,'edges':edges}
(out/'source-inventory.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['records','edges','entryStaticModules','queryVariants']},indent=2))
