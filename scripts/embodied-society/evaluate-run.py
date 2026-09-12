#!/usr/bin/env python3
"""Evaluate recorded state transitions; never infer application from provider text."""
import hashlib,json,sys
from pathlib import Path

def quantities(items):
 result={}
 for item in items:result[item['catalogId']]=result.get(item['catalogId'],0)+item['quantity']
 return result

def tool_chain(manifest, checkpoint):
 """Conservative custody accounting: starter items never receive earned credit."""
 rules=manifest.get('materialRules')
 if not rules:return {'status':'unavailable-rules-not-recorded','verifiedUses':[]}
 recipes={r['id']:r for r in rules['recipes']}
 nodes={n['id']:n for n in manifest['manifest']['resources']}
 credits={};crafted={};pending=None;uses=[]
 for e in checkpoint.get('actionEvidence',[]):
  before,after=e['before'],e.get('after');action=e['action']
  if not after or e['status']!='applied':continue
  b,a=quantities(before['inventory']),quantities(after['inventory'])
  delta={k:a.get(k,0)-b.get(k,0) for k in set(a)|set(b)}
  # Never carry credit through an unrecorded disappearance or unexplained gain.
  for key in credits:credits[key]=min(credits[key],b.get(key,0))
  for key in crafted:crafted[key]=min(crafted[key],b.get(key,0))
  if action['kind']=='gather':
   node=nodes.get(action.get('targetId'));q=action.get('quantity')
   if node and q==1 and before['resources'].get(node['id'],0)-after['resources'].get(node['id'],0)==q and delta.get(node['materialId'])==q:
    tool=node.get('requiredTool')
    if tool:
     bt=next((i for i in before['inventory'] if i['catalogId']==tool),None)
     at=next((i for i in after['inventory'] if i['catalogId']==tool),None)
     bc=(bt.get('condition') if bt else None);ac=(at.get('condition') if at else None)
     bc=1 if bc is None and bt else bc
     if credits.get(tool,0)>0 and crafted.get(tool,0)==1 and b.get(tool)==1 and bt and at and isinstance(bc,(int,float)) and isinstance(ac,(int,float)) and abs(bc-ac-.1)<1e-8:
      uses.append({'decision':e['decision'],'toolId':tool,'gatheredMaterialId':node['materialId'],'quantity':q,'conditionBefore':bc,'conditionAfter':ac})
    credits[node['materialId']]=credits.get(node['materialId'],0)+q
  elif action['kind']=='craft':
   recipe=recipes.get(action.get('recipeId'));job=after.get('job')
   valid=bool(recipe and job and not before.get('job') and job.get('recipeId')==recipe['id'] and job.get('escrow')==recipe['inputs'] and job.get('readyAt',-1)-job.get('startedAt',0)==recipe['durationTicks'])
   if valid:valid=all(delta.get(k)==-v and credits.get(k,0)>=v for k,v in recipe['inputs'].items())
   pending={'job':job,'recipe':recipe} if valid else None
   for k,n in delta.items():
    if n<0:
     credits[k]=max(0,credits.get(k,0)+n);crafted[k]=max(0,crafted.get(k,0)+n)
  elif action['kind']=='finish':
   if pending and before.get('job')==pending['job'] and not after.get('job') and after.get('tick',-1)>=pending['job']['readyAt']:
    outputs=pending['recipe']['outputs']
    if all(delta.get(k)==v for k,v in outputs.items()) and all(n==0 or k in outputs for k,n in delta.items()):
     for k,n in outputs.items():
      credits[k]=credits.get(k,0)+n;crafted[k]=crafted.get(k,0)+n
   pending=None
  else:
   # Cancellation does not demonstrate a finished transformation chain.
   if action['kind']=='cancel':pending=None
   for k,n in delta.items():
    if n<0:
     credits[k]=max(0,credits.get(k,0)+n);crafted[k]=max(0,crafted.get(k,0)+n)
  for key in credits:credits[key]=min(credits[key],a.get(key,0))
  for key in crafted:crafted[key]=min(crafted[key],a.get(key,0))
 return {'status':'evaluated','verifiedUses':uses,'meaning':'Gathered inputs, paid timed transformations and later tool-dependent gathering with measured wear; state-transition self-review.'}

def evaluate(manifest,checkpoint):
 if manifest['runId']!=checkpoint['runId']:raise ValueError('Run mismatch')
 records=[]
 for e in checkpoint.get('actionEvidence',[]):
  action=e['action'];before=e['before'];after=e.get('after')
  item={'decision':e['decision'],'kind':action['kind'],'status':e['status']}
  if not after:records.append(item);continue
  b,a=quantities(before['inventory']),quantities(after['inventory'])
  changes={key:a.get(key,0)-b.get(key,0) for key in set(b)|set(a) if a.get(key,0)!=b.get(key,0)}
  item['inventoryDelta']=changes
  if action['kind']=='move':item['completedPathMeters']=e.get('pathMeters',0) if e['status']=='movement-completed' else 0
  if action['kind']=='gather':
   target=action['targetId'];depletion=before['resources'].get(target,0)-after['resources'].get(target,0)
   node=next((n for n in manifest['manifest']['resources'] if n['id']==target),None)
   item['balancedGather']=bool(node and e['status']=='applied' and depletion==action['quantity'] and changes.get(node['materialId'])==depletion)
  if action['kind']=='consume':
   material=action['materialId'];need={'trail-water':'water','route-snack':'food'}.get(material)
   gain=after['needs'][need]-before['needs'][need] if need else 0
   item['needGain']=gain;item['consumptionVerified']=e['status']=='applied' and changes.get(material)==-1 and gain>0
  if action['kind']=='finish':
   job=before.get('job');item['completedRecipe']=job.get('recipeId') if job and not after.get('job') and e['status']=='applied' and any(n>0 for n in changes.values()) else None
  if action['kind']=='build':item['placementVerified']=e['status']=='applied' and len(after['structures'])==len(before['structures'])+1 and changes.get(action.get('materialId'))==-1
  records.append(item)
 return {'schemaVersion':1,'runId':checkpoint['runId'],'profile':manifest['manifest'].get('profile'),
  'researchSourceFingerprint':manifest.get('sourceFingerprint'),'model':manifest.get('model'),
  'status':checkpoint['status'],'simulatedSeconds':checkpoint.get('frames',0)/60,
  'controllerCalls':checkpoint.get('calls'),'completedPathMeters':sum(r.get('completedPathMeters',0) for r in records),
  'balancedGathers':sum(r.get('balancedGather',False) for r in records),
  'verifiedConsumptions':sum(r.get('consumptionVerified',False) for r in records),
  'completedRecipes':[r['completedRecipe'] for r in records if r.get('completedRecipe')],
  'verifiedPlacements':sum(r.get('placementVerified',False) for r in records),
  'toolChain':tool_chain(manifest,checkpoint),
  'records':records,'limitations':['State-transition self-evaluation; no independent reviewer.','Placement alone does not verify structural usefulness.','Source fingerprint covers research modules, not all external world inputs.']}

def main():
 if len(sys.argv)!=2:raise ValueError('Pass one private run directory')
 root=Path(sys.argv[1]);paths=[root/'manifest/workshop.json',root/'checkpoint/workshop.json']
 blobs=[p.read_bytes() for p in paths]
 result=evaluate(*[json.loads(b) for b in blobs]);result['sourceSha256']=[hashlib.sha256(b).hexdigest() for b in blobs]
 print(json.dumps(result,indent=2,sort_keys=True))
if __name__=='__main__':main()
