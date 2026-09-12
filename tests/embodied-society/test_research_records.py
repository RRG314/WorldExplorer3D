import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('records',ROOT/'scripts/embodied-society/research-records.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class PublicRecords(unittest.TestCase):
 def setUp(self):self.doc=json.loads((r.DEST/'development-runs.json').read_text())
 def test_inventory_summary_matches(self):self.assertEqual(r.summarize(self.doc),json.loads((r.DEST/'summary.json').read_text()))
 def test_private_field_rejected(self):
  self.doc['runs'][0]['apiKey']='private-placeholder'
  with self.assertRaises(ValueError):r.validate(self.doc)
 def test_mismatched_counts_rejected(self):
  self.doc['runs'][0]['providerCalls']+=1
  with self.assertRaises(ValueError):r.validate(self.doc)
 def test_negative_usage_rejected(self):
  self.doc['runs'][0]['providerEvents'][0]['usage']['inputTokens']=-1
  with self.assertRaises(ValueError):r.validate(self.doc)
 def test_duplicate_run_rejected(self):
  self.doc['runs'].append(copy.deepcopy(self.doc['runs'][0]))
  with self.assertRaises(ValueError):r.validate(self.doc)
 def test_export_omits_free_text_and_private_context(self):
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp)/'free-123-abc';(d/'model').mkdir(parents=True)
   (d/'model/workshop.json').write_text(json.dumps({'calls':1,'secret':'private-placeholder','events':[{'call':1,'status':'failed','error':'private-placeholder','command':{'kind':'wait','private':'private-placeholder'},'usage':{'inputTokens':3,'secret':'private-placeholder'}}]}))
   result=r.make_run(d)
   self.assertNotIn('private-placeholder',json.dumps(result));self.assertIsNone(result['checkpoint']['frames'])
 def test_controller_attempt_can_fail_before_provider_dispatch(self):
  self.doc['runs'][0]['checkpoint']['controllerCalls']=self.doc['runs'][0]['providerCalls']+1
  r.validate(self.doc)
 def test_provider_success_not_world_success(self):self.assertIsNone(r.summarize(self.doc)['worldActionsApplied'])
if __name__=='__main__':unittest.main()
