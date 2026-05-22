
import json, os, sys, time
from pathlib import Path
from datetime import datetime, timezone
try:
    import requests
except Exception as e:
    print(json.dumps({'ok': False, 'error': f'requests import failed: {e}'})); sys.exit(1)
try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None
ROOT = Path('/Users/gbot/Projects/lead-gen-saul')
if load_dotenv:
    load_dotenv(ROOT/'.env.local')
    load_dotenv(ROOT/'python-agent/.env')
api_key = os.getenv('GHL_API_KEY','')
location_id = os.getenv('GHL_LOCATION_ID','')
if not api_key or not location_id:
    print(json.dumps({'ok': False, 'error': 'missing GHL_API_KEY or GHL_LOCATION_ID'})); sys.exit(0)
base='https://services.leadconnectorhq.com'
headers={'Authorization':f'Bearer {api_key}','Version':'2021-07-28','Accept':'application/json','Content-Type':'application/json'}
endpoints={
 'location': f'/locations/{location_id}',
 'custom_fields': f'/locations/{location_id}/customFields',
 'custom_values': f'/locations/{location_id}/customValues',
 'tags': f'/locations/{location_id}/tags',
 'pipelines': f'/opportunities/pipelines?locationId={location_id}',
 'calendars': f'/calendars/?locationId={location_id}',
 'workflows': f'/workflows/?locationId={location_id}',
}
out={'captured_at': datetime.now(timezone.utc).isoformat(), 'location_id': location_id, 'responses': {}}
summary={}
for name,path in endpoints.items():
    url=base+path
    try:
        r=requests.get(url,headers=headers,timeout=20)
        try: data=r.json()
        except Exception: data={'raw':r.text[:2000]}
        out['responses'][name]={'status':r.status_code,'data':data}
        if name=='custom_fields':
            fields=data.get('customFields') or data.get('custom_fields') or data.get('fields') or []
            summary['custom_fields_count']=len(fields)
            summary['custom_fields']=[{'id':f.get('id'),'name':f.get('name'),'fieldKey':f.get('fieldKey') or f.get('field_key'),'dataType':f.get('dataType') or f.get('data_type'),'folderId':f.get('folderId'),'folderName':f.get('folderName')} for f in fields]
        elif name=='tags':
            tags=data.get('tags') or []
            summary['tags_count']=len(tags)
            summary['tags']=[t.get('name') for t in tags]
        elif name=='pipelines':
            pipes=data.get('pipelines') or []
            summary['pipelines']=[{'id':p.get('id'),'name':p.get('name'),'stages':[s.get('name') for s in p.get('stages',[])]} for p in pipes]
        elif name=='workflows':
            workflows=data.get('workflows') or data.get('data') or []
            summary['workflows']=[{'id':w.get('id'),'name':w.get('name'),'status':w.get('status')} for w in workflows]
        else:
            summary[name+'_status']=r.status_code
    except Exception as e:
        out['responses'][name]={'error':repr(e)}
        summary[name+'_error']=repr(e)
    time.sleep(0.2)
outdir=Path('/Users/gbot/.hermes/work/hermes-review')
outdir.mkdir(parents=True,exist_ok=True)
path=outdir/f'exotiq_ghl_backup_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'
path.write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps({'ok': True, 'backup_path': str(path), 'summary': summary}, indent=2))
