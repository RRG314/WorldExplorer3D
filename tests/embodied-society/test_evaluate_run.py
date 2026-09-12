import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('evaluate_run', ROOT/'scripts/embodied-society/evaluate-run.py')
evaluator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluator)

class ActionEvidence(unittest.TestCase):
 def setUp(self):
  self.manifest = {'runId':'test', 'manifest':{'resources':[{'id':'water-node','materialId':'trail-water'}]}}
  self.state = {'inventory':[], 'needs':{'water':.4,'food':.5}, 'resources':{'water-node':8}, 'job':None, 'structures':[]}
 def record(self, action, before, after, status='applied', **extra):
  entry = {'decision':1,'action':action,'before':before,'after':after,'status':status,**extra}
  return evaluator.evaluate(self.manifest, {'runId':'test','status':'ended','actionEvidence':[entry]})
 def test_provider_completion_alone_has_no_behavioral_success(self):
  result=evaluator.evaluate(self.manifest, {'runId':'test','status':'ended','calls':1})
  self.assertEqual(result['verifiedConsumptions'],0)
  self.assertEqual(result['balancedGathers'],0)
 def test_gather_requires_matching_depletion_and_inventory(self):
  after=copy.deepcopy(self.state);after['inventory']=[{'catalogId':'trail-water','quantity':1}]
  action={'kind':'gather','targetId':'water-node','quantity':1}
  self.assertEqual(self.record(action,self.state,after)['balancedGathers'],0)
  after['resources']['water-node']=7
  self.assertEqual(self.record(action,self.state,after)['balancedGathers'],1)
  self.assertEqual(self.record(action,self.state,after,'rejected')['balancedGathers'],0)
 def test_consumption_requires_item_use_and_need_gain(self):
  before=copy.deepcopy(self.state);before['inventory']=[{'catalogId':'trail-water','quantity':1}]
  after=copy.deepcopy(before);after['needs']['water']=.8
  action={'kind':'consume','materialId':'trail-water','quantity':1}
  self.assertEqual(self.record(action,before,after)['verifiedConsumptions'],0)
  after['inventory']=[]
  self.assertEqual(self.record(action,before,after)['verifiedConsumptions'],1)
  self.assertEqual(self.record(action,before,after,'rejected')['verifiedConsumptions'],0)
  after['needs']['water']=.4
  self.assertEqual(self.record(action,before,after)['verifiedConsumptions'],0)
 def test_recipe_requires_finished_job_and_output(self):
  before=copy.deepcopy(self.state);before['job']={'recipeId':'cord'}
  after=copy.deepcopy(self.state)
  self.assertEqual(self.record({'kind':'finish'},before,after)['completedRecipes'],[])
  after['inventory']=[{'catalogId':'cord','quantity':1}]
  self.assertEqual(self.record({'kind':'finish'},before,after)['completedRecipes'],['cord'])
 def test_placement_requires_kit_consumption(self):
  before=copy.deepcopy(self.state);before['inventory']=[{'catalogId':'wall-kit','quantity':1}]
  after=copy.deepcopy(before);after['structures']=[{'id':'wall'}]
  action={'kind':'build','materialId':'wall-kit'}
  self.assertEqual(self.record(action,before,after)['verifiedPlacements'],0)
  after['inventory']=[]
  self.assertEqual(self.record(action,before,after)['verifiedPlacements'],1)
 def test_interrupted_movement_is_not_completed_path(self):
  self.assertEqual(self.record({'kind':'move'},self.state,self.state,'movement-interrupted',pathMeters=3)['completedPathMeters'],0)
 def test_mismatched_run_rejected(self):
  with self.assertRaises(ValueError):evaluator.evaluate(self.manifest,{'runId':'other'})

class UsefulToolEvidence(unittest.TestCase):
 def setUp(self):
  self.manifest={'materialRules':{'recipes':[{'id':'make-tool','inputs':{'raw':1},'outputs':{'tool':1},'durationTicks':2}]},'manifest':{'resources':[{'id':'raw-node','materialId':'raw'},{'id':'timber-node','materialId':'timber','requiredTool':'tool'}]}}
  state={'tick':0,'inventory':[],'resources':{'raw-node':1,'timber-node':1},'job':None}
  self.events=[]
  def add(action,after):
   nonlocal state
   self.events.append({'decision':len(self.events)+1,'action':action,'status':'applied','before':copy.deepcopy(state),'after':copy.deepcopy(after)})
   state=copy.deepcopy(after)
  s=copy.deepcopy(state);s['resources']['raw-node']=0;s['inventory']=[{'catalogId':'raw','quantity':1}]
  add({'kind':'gather','targetId':'raw-node','quantity':1},s)
  s=copy.deepcopy(state);s['inventory']=[];s['job']={'recipeId':'make-tool','startedAt':0,'readyAt':2,'escrow':{'raw':1}}
  add({'kind':'craft','recipeId':'make-tool'},s)
  s=copy.deepcopy(state);s['job']=None;s['tick']=2;s['inventory']=[{'catalogId':'tool','quantity':1,'condition':None}]
  add({'kind':'finish'},s)
  s=copy.deepcopy(state);s['resources']['timber-node']=0;s['inventory'][0]['condition']=.9;s['inventory'].append({'catalogId':'timber','quantity':1})
  add({'kind':'gather','targetId':'timber-node','quantity':1},s)
 def result(self):return evaluator.tool_chain(self.manifest,{'actionEvidence':self.events})['verifiedUses']
 def test_paid_finished_tool_used_with_wear(self):self.assertEqual(len(self.result()),1)
 def test_starter_tool_does_not_count_as_manufactured(self):
  self.events=self.events[-1:];self.assertEqual(self.result(),[])
 def test_ungathered_ingredients_do_not_count(self):
  self.events=self.events[1:];self.assertEqual(self.result(),[])
 def test_unpaid_recipe_does_not_count(self):
  self.events[1]['after']['inventory']=[{'catalogId':'raw','quantity':1}]
  self.assertEqual(self.result(),[])
 def test_premature_completion_does_not_count(self):
  self.events[2]['after']['tick']=1;self.assertEqual(self.result(),[])
 def test_wrong_output_does_not_count(self):
  self.manifest['materialRules']['recipes'][0]['outputs']={'different-tool':1};self.assertEqual(self.result(),[])
 def test_no_wear_does_not_count(self):
  self.events[-1]['after']['inventory'][0]['condition']=1;self.assertEqual(self.result(),[])
 def test_rejected_use_does_not_count(self):
  self.events[-1]['status']='rejected';self.assertEqual(self.result(),[])
 def test_no_frozen_rules_means_unavailable(self):
  self.manifest.pop('materialRules');self.assertEqual(evaluator.tool_chain(self.manifest,{'actionEvidence':self.events})['status'],'unavailable-rules-not-recorded')

if __name__=='__main__':unittest.main()
