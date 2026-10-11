import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('trip_import', Path(__file__).with_name('import_sales_trip.py'))
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def evidence():
    return {'company_name': 'Example Exotics', 'city': 'Atlanta', 'state': 'GA',
            'website': 'https://example.test', 'phone': '4045550199', 'email': 'hello@example.test',
            'owner': {'name': None, 'confidence': 'unknown'},
            'icp': {'self_drive': True, 'fleet_min_visible': 6},
            'address': {'status': 'unknown'}, 'source_urls': ['https://example.test'],
            'checked_at': '2026-10-11T00:00:00Z', 'priority': 'B'}


class TripImportTests(unittest.TestCase):
    def test_domain_normalization(self):
        self.assertEqual(m.domain('https://www.example.test/cars'), 'example.test')

    def test_existing_state_and_metadata_preserved(self):
        old = {'id': 'abc', 'company_name': 'Example Exotics', 'company_domain': 'example.test',
               'phone': '4045550100', 'status': 'engaged', 'score': 80, 'assigned_to': 'benjamin',
               'updated_at': 'version1', 'score_breakdown': {'owner_name': 'Founder', 'outreach_hold': True}}
        untouched = copy.deepcopy(old)
        plan = m.plan_records([evidence()], [old])
        self.assertEqual(old, untouched)
        patch = plan['operations'][0]['payload']
        for key in ['status', 'score', 'assigned_to', 'phone', 'first_name', 'last_name']:
            self.assertNotIn(key, patch)
        self.assertEqual(patch['score_breakdown']['owner_name'], 'Founder')
        self.assertTrue(patch['score_breakdown']['outreach_hold'])
        self.assertEqual(patch['score_breakdown']['road_trip_2026']['contact_conflicts']['phone']['existing'], '4045550100')

    def test_suppression_never_reactivated(self):
        for status in ['converted', 'lost', 'disqualified']:
            old = {'id': 'abc', 'company_domain': 'example.test', 'status': status}
            plan = m.plan_records([evidence()], [old])
            self.assertEqual(len(plan['operations']), 0)
            self.assertEqual(len(plan['held']), 1)

    def test_ambiguous_match_is_held(self):
        rows = [{'id': str(i), 'company_domain': 'example.test'} for i in [1, 2]]
        self.assertEqual(len(m.plan_records([evidence()], rows)['held']), 1)

    def test_new_is_held_from_outreach_and_idempotent(self):
        first = m.plan_records([evidence()], [])['operations'][0]
        self.assertEqual(first['method'], 'POST')
        self.assertEqual(first['payload']['score'], 0)
        self.assertTrue(first['payload']['score_breakdown']['outreach_hold'])
        second = m.plan_records([evidence()], [first['payload']])
        self.assertEqual(second['operations'], [])
        self.assertEqual(len(second['unchanged']), 1)

    def test_no_unverified_email_guess_or_owner_name(self):
        rec = evidence()
        rec['email'] = None
        rec['owner'] = {'name': 'Registered Agent', 'confidence': 'unknown'}
        row = m.plan_records([rec], [])['operations'][0]['payload']
        self.assertNotIn('email', row)
        self.assertNotIn('first_name', row)

    def test_new_below_minimum_not_imported(self):
        rec = evidence()
        rec['icp']['fleet_min_visible'] = 2
        self.assertEqual(len(m.plan_records([rec], [])['held']), 1)

    def test_wrong_icp_held(self):
        rec = evidence()
        rec['icp']['self_drive'] = False
        self.assertEqual(len(m.plan_records([rec], [])['held']), 1)

    def test_duplicate_input_held(self):
        plan = m.plan_records([evidence(), evidence()], [])
        self.assertEqual(len(plan['operations']), 1)
        self.assertEqual(len(plan['held']), 1)

    def test_invalid_legacy_phone_repaired_with_audit(self):
        old = {'id': 'abc', 'company_domain': 'example.test', 'phone': 'example.test', 'score_breakdown': {}}
        op = m.plan_records([evidence()], [old])['operations'][0]
        self.assertEqual(op['payload']['phone'], '4045550199')
        after = dict(old, **op['payload'])
        self.assertEqual(m.plan_records([evidence()], [after])['operations'], [])

    def test_reviewed_mapping_requires_matching_id_and_reason(self):
        rec = evidence()
        rows = [{'id': 'a', 'company_domain': 'example.test'}, {'id': 'b', 'company_domain': 'example.test'}]
        rec.update({'reviewed_canonical_lead_id': 'a', 'reviewed_canonical_reason': 'Reviewed exact location'})
        plan = m.plan_records([rec], rows)
        self.assertEqual(plan['operations'][0]['id'], 'a')
        self.assertEqual(plan['operations'][0]['payload']['score_breakdown']['road_trip_2026']['related_existing_lead_ids'], ['b'])
        rec['reviewed_canonical_lead_id'] = 'unrelated'
        self.assertEqual(len(m.plan_records([rec], rows)['held']), 1)
        rec['reviewed_canonical_lead_id'] = 'a'
        rows[1]['status'] = 'converted'
        self.assertEqual(len(m.plan_records([rec], rows)['held']), 1)

    def test_reviewed_name_correction_preserves_original(self):
        rec = evidence()
        rec.update({'reviewed_canonical_lead_id': 'a', 'reviewed_canonical_reason': 'Exact site', 'reviewed_company_name': 'Example Exotics Atlanta'})
        old = {'id': 'a', 'company_name': 'Atlanta Exotic and', 'company_domain': 'example.test'}
        patch = m.plan_records([rec], [old])['operations'][0]['payload']
        self.assertEqual(patch['company_name'], 'Example Exotics Atlanta')
        self.assertEqual(patch['score_breakdown']['previous_company_name'], 'Atlanta Exotic and')
        self.assertEqual(m.plan_records([rec], [dict(old, **patch)])['operations'], [])

    def test_exact_place_does_not_hide_suppressed_duplicate(self):
        for reviewed in [False, True]:
            rec = evidence()
            rec['google'] = {'place_id': 'test-place'}
            rows = [
                {'id': 'a', 'company_domain': 'example.test', 'score_breakdown': {'google_place_id': 'test-place'}},
                {'id': 'b', 'company_domain': 'example.test', 'red_flags': ['unsubscribed']},
            ]
            if reviewed:
                rec.update({'reviewed_canonical_lead_id': 'a', 'reviewed_canonical_reason': 'Reviewed branch'})
            plan = m.plan_records([rec], rows)
            self.assertEqual(plan['operations'], [])
            self.assertEqual(len(plan['held']), 1)

    def test_same_place_different_city_alias_is_not_created_twice(self):
        first = evidence()
        first['google'] = {'place_id': 'test-place'}
        alias = copy.deepcopy(first)
        alias['city'] = 'Marietta'
        plan = m.plan_records([first, alias], [])
        self.assertEqual(len(plan['operations']), 1)
        self.assertEqual(len(plan['held']), 1)

    def test_mixed_place_enrichment_alias_is_held_in_both_orders(self):
        first = evidence()
        first['google'] = {'place_id': 'test-place'}
        alias = copy.deepcopy(first)
        alias['city'] = 'Marietta'
        alias.pop('google')
        for records in [[first, alias], [alias, first]]:
            plan = m.plan_records(records, [])
            self.assertEqual(len(plan['operations']), 1)
            self.assertEqual(len(plan['held']), 1)

    def test_partial_contact_alias_matches_earlier_planned_creation(self):
        first = evidence()
        first['google'] = {'place_id': 'test-place'}
        alias = copy.deepcopy(first)
        alias.update({'city': 'Marietta', 'phone': None, 'email': None})
        alias.pop('google')
        for records in [[first, alias], [alias, first]]:
            plan = m.plan_records(records, [])
            self.assertEqual(len(plan['operations']), 1)
            self.assertEqual(len(plan['held']), 1)

    def test_one_canonical_target_written_at_most_once_per_plan(self):
        first = evidence()
        alias = copy.deepcopy(first)
        alias['city'] = 'Marietta'
        old = {'id': 'a', 'company_domain': 'example.test'}
        plan = m.plan_records([first, alias], [old])
        self.assertEqual(len(plan['operations']), 1)
        self.assertEqual(len(plan['held']), 1)

    def test_unsubscribed_shape_and_hold(self):
        for flags in [['unsubscribed'], [{'code': 'unsubscribed'}]]:
            old = {'id': 'abc', 'company_domain': 'example.test', 'red_flags': flags}
            self.assertEqual(len(m.plan_records([evidence()], [old])['held']), 1)


if __name__ == '__main__':
    unittest.main()
