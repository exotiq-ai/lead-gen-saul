#!/usr/bin/env python3
"""Verify a private two-pass snapshot; attach baseline metadata only with --apply.
Never rewrites canonical leads, attribution history, contact data or assignments.
"""
import argparse, hashlib, json, pathlib, urllib.request, urllib.parse
TENANT='00000000-0000-0000-0000-000000000001'
PROJECT='qbvkisrazmipmwlejqtf.supabase.co'
def verify(directory):
 root=pathlib.Path(directory).resolve();raw=(root/'manifest.json').read_bytes();manifest=json.loads(raw)
 for entry in manifest['files']:
  if pathlib.Path(entry['name']).name!=entry['name']:raise ValueError('Unsafe manifest path')
  b=(root/entry['name']).read_bytes()
  if len(b)!=entry['bytes'] or hashlib.sha256(b).hexdigest()!=entry['sha256']:raise ValueError('Snapshot checksum mismatch')
 summary=manifest['snapshot'];index=json.loads((root/'baseline-index.json').read_text())
 if summary['tenant_id']!=TENANT or not summary['stable_between_passes']:raise ValueError('Wrong tenant or unstable snapshot')
 if len(index)!=summary['counts']['leads'] or len({r['lead_id'] for r in index})!=len(index):raise ValueError('Snapshot coverage mismatch')
 if any(r['tenant_id']!=TENANT for r in index):raise ValueError('Foreign snapshot row')
 rows=[{k:r.get(k) for k in ['lead_id','original_source','original_assigned_to','source_review_required']} for r in index]
 payload={'tenant_id':TENANT,'captured_at':summary['read_intervals'][1]['ended_at'],'lead_count':len(rows),'exception_count':sum(bool(r['source_review_required']) for r in rows),'manifest_sha256':hashlib.sha256(raw).hexdigest()}
 if payload['exception_count']!=summary['source_review_count']:raise ValueError('Snapshot exception count mismatch')
 return payload,rows

def envfile(path):
 result={}
 for line in pathlib.Path(path).read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#') or '=' not in line:continue
  k,v=line.split('=',1);v=v.strip()
  if v.startswith('"'):v=json.loads(v)
  else:v=v.strip("'")
  result[k.strip()]=v
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--snapshot',required=True);p.add_argument('--env',default='.env.local');p.add_argument('--apply',action='store_true');a=p.parse_args()
 summary,rows=verify(a.snapshot)
 if not a.apply:print(json.dumps({'mode':'verified_dry_run','remote_writes':0,**summary},indent=2));return
 e=envfile(a.env);url=e['NEXT_PUBLIC_SUPABASE_URL'];key=e['SUPABASE_SERVICE_ROLE_KEY']
 if urllib.parse.urlparse(url).hostname!=PROJECT:raise ValueError('Unexpected Supabase project')
 def request(path,data=None):
  req=urllib.request.Request(url+'/rest/v1/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'count=exact'})
  with urllib.request.urlopen(req,timeout=60) as r:return json.load(r),r.headers.get('Content-Range')
 snap,_=request('rpc/sales_import_baseline',{'p_summary':summary,'p_accounts':rows})
 saved,_=request('sales_baseline_snapshots?'+urllib.parse.urlencode({'id':'eq.'+snap['id'],'tenant_id':'eq.'+TENANT,'select':'id,manifest_sha256,lead_count,exception_count,captured_at'}))
 assert len(saved)==1 and saved[0]['manifest_sha256']==summary['manifest_sha256']
 actual=[];total=None
 while total is None or len(actual)<total:
  page,content_range=request('sales_baseline_accounts?'+urllib.parse.urlencode({'snapshot_id':'eq.'+snap['id'],'tenant_id':'eq.'+TENANT,'select':'lead_id,original_source,original_assigned_to,source_review_required','order':'lead_id.asc','offset':len(actual),'limit':500}))
  count=int(content_range.split('/')[-1]);assert total is None or count==total;total=count
  if not page and len(actual)<total:raise ValueError('Incomplete baseline readback')
  actual.extend(page)
 assert sorted(actual,key=lambda r:r['lead_id'])==sorted(rows,key=lambda r:r['lead_id'])
 print(json.dumps({'mode':'applied_and_readback_verified','snapshot_id':snap['id'],'canonical_lead_updates':0,**summary},indent=2))
if __name__=='__main__':main()
