import ast
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
def assigned(path,name):
 tree=ast.parse(path.read_text())
 for node in tree.body:
  if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in node.targets):return ast.literal_eval(node.value)
 raise AssertionError(name)
class LaunchCopyTests(unittest.TestCase):
 def test_fallback_templates_lead_with_launch(self):
  templates=assigned(ROOT/'python-agent/skills/draft.py','TEMPLATES')
  self.assertEqual(len(templates),3)
  for item in templates.values():
   body=item['body'];self.assertIn('launched Drive Exotiq',body);self.assertIn('Exotiq Command Center',body)
   for old in ['Worth','expensive leak','paid, verified booking','—']:self.assertNotIn(old,body)
 def test_seed_bodies_match_fallbacks(self):
  templates=assigned(ROOT/'python-agent/skills/draft.py','TEMPLATES')
  steps=assigned(ROOT/'scripts/update_exotiq_pilot_templates.py','steps')
  self.assertEqual([x['body'] for x in templates.values()],[x['body'] for x in steps])
 def test_no_unverified_personalization(self):
  tree=ast.parse((ROOT/'python-agent/skills/draft.py').read_text())
  funcs: list[ast.stmt] = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['_first_text','_personalization_hook']]
  import datetime
  ns={'Any':object,'datetime':datetime.datetime,'timezone':datetime.timezone}
  import __future__
  exec(compile(ast.Module(body=funcs,type_ignores=[]),'hooks','exec',flags=__future__.annotations.compiler_flag),ns)
  self.assertEqual(ns['_personalization_hook']({'company_name':'Test','score_breakdown':{'latest_instagram_post_summary':'a Ferrari post'}}),'')
 def test_customer_and_review_holds_cannot_be_redrafted_as_cold(self):
  tree=ast.parse((ROOT/'python-agent/skills/draft.py').read_text())
  funcs: list[ast.stmt] = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['_exotiq_drafting_hold','_automatic_review_allowed']]
  ns={'DEFAULT_TENANT_ID':'exotiq','OUTREACH_AUTO_APPROVE':True}
  exec(compile(ast.Module(body=funcs,type_ignores=[]),'guards','exec'),ns)
  guard=ns['_exotiq_drafting_hold']
  for record in [{'converted_at':'2026-05-01'},{'stage_id':'f9e0488f-fbd4-49a0-97cf-094aa74b80db'},{'score_breakdown':{'launch_copy_review':{'lane':'customer_relationship'}}},{'score_breakdown':{'launch_copy_review':{'lane':'cold','review_holds':['recent_activity_unverified']}}}]:self.assertTrue(guard(record))
  self.assertFalse(guard({'score_breakdown':{'launch_copy_review':{'lane':'cold','review_holds':[]}}}))
  self.assertFalse(ns['_automatic_review_allowed']('exotiq'))
  self.assertTrue(ns['_automatic_review_allowed']('other-tenant'))
if __name__=='__main__':unittest.main()
