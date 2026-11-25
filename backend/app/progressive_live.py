"""Read-only, actor/project-bound Showcase delivery into Issue 43's journal.

The source grant is private runtime state, never an exportable project artifact.
Only explicit connection/resume starts a reader; it cannot request inference.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import threading
from contextvars import copy_context
from urllib.parse import urlsplit
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from . import progressive_authoring as progressive, storage
from .pythia_hosted import digest

class Connection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    handoffId: str = Field(pattern=r'^[a-f0-9-]{36}$')
    handoffToken: str = Field(min_length=32, max_length=128, repr=False)

def private_path(project, job, actor):
    identity = hashlib.sha256(f'{actor}\0{project}\0{job}'.encode()).hexdigest()
    return storage.ROOT/'progressive-links'/(identity+'.json')

def save_connection(project,job,actor,connection):
    path=private_path(project,job,actor);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(connection.model_dump(),f)

def existing_connection(project,actor,connection):
    with storage.storyboard_transaction():
        for path in progressive._directory(project).glob('*.json'):
            job=json.loads(path.read_text())
            if job['actorId']==actor and (job.get('connectionId') or job.get('liveBinding',{}).get('handoffId'))==connection.handoffId:
                path=private_path(project,job['jobId'],actor)
                if path.exists():
                    saved=Connection.model_validate_json(path.read_text())
                    if not hmac.compare_digest(saved.handoffToken,connection.handoffToken):raise HTTPException(403,'Handoff access denied')
                return job
    return None

def fetch(project,job,actor):
    path=private_path(project,job,actor)
    if not path.exists():raise HTTPException(403,'Progressive connection is unavailable')
    connection=Connection.model_validate_json(path.read_text())
    # Reuse the existing private native bridge configuration, never a browser URL.
    base=os.environ.get('CHIMERA_PYTHIA_NATIVE_BASE_URL','').rstrip('/')
    parsed=urlsplit(base);key=os.environ.get('CHIMERA_PYTHIA_NATIVE_API_KEY','')
    if (parsed.scheme not in {'https','http'} or parsed.username or parsed.password or parsed.query or parsed.fragment
        or not base.endswith('/v1/chimera-engine') or len(key)<32
        or parsed.scheme=='http' and parsed.hostname not in {'127.0.0.1','localhost','::1'}):
        raise HTTPException(503,'The private Pythia bridge is not configured')
    try:
        with httpx.Client(timeout=10,trust_env=False,follow_redirects=False) as client:
            with client.stream('GET',base+'/showcase-handoffs/'+connection.handoffId,
                params={'projectId':project,'actorId':actor},headers={'Authorization':'Bearer '+key,'X-Pythia-Handoff':connection.handoffToken}) as response:
                if response.status_code in {401,403,404}:raise HTTPException(403,'The Pythia handoff was revoked or access was denied')
                response.raise_for_status();raw=bytearray()
                for chunk in response.iter_bytes():
                    if len(raw)+len(chunk)>1048576:raise ValueError('Oversized handoff')
                    raw.extend(chunk)
        result=json.loads(raw)
        if (result.get('format')!='pythia-chimera-progressive-v1' or result.get('handoffId')!=connection.handoffId
            or result.get('projectId')!=project or result.get('actorId')!=actor):raise ValueError('Wrong binding')
        validate(result)
        return result
    except HTTPException:raise
    except (httpx.HTTPError,ValueError,KeyError,TypeError):raise HTTPException(503,'Pythia handoff verification failed; reconnect explicitly') from None

def validate(document):
    if document['status'] not in {'accepted','running','completed','failed','interrupted','cancelled'}:raise ValueError('Status')
    if not re.fullmatch('[a-f0-9]{64}',document['inputSha256']):raise ValueError('Input digest')
    sources=document['sources'];findings=document['findings']
    if not isinstance(sources,list) or len(sources)>3 or not isinstance(findings,list) or len(findings)>8:raise ValueError('Allowance')
    for source in sources:
        if digest(source['units'])!=source['text_sha256']:raise ValueError('Source text digest')
    seen=set()
    for f in findings:
        if f['format'] not in {'pythia-showcase-finding-v1','pythia-showcase-finding-v2'} or f['revision']!=1 or f['status']!='provisional':raise ValueError('Finding version')
        keys={'consultation_id','actor_id','source_id','original_sha256','unit_label','quote'}
        if f['format'].endswith('v2'):keys|={'content','text_sha256'}
        if set(f)!=keys|{'format','finding_id','revision','status','coverage','limitations'}:raise ValueError('Finding shape')
        if digest({k:f[k] for k in keys})!=f['finding_id'] or f['finding_id'] in seen:raise ValueError('Finding digest')
        seen.add(f['finding_id'])
        source=next((s for s in sources if s['source_id']==f['source_id']),None)
        if source is None:raise ValueError('Unknown source')
        if (f['actor_id']!=document['sourceActor'] or f['consultation_id']!=document['consultationId'] or source['original_sha256']!=f['original_sha256']
            or not any(u['label']==f['unit_label'] and f['quote'] in u['text'] for u in source['units'])
            or 'text_sha256' in f and f['text_sha256']!=source['text_sha256']):raise ValueError('Unbound citation')
        if not 1<=len(f.get('content',f['quote']))<=2000 or not 1<=len(f['quote'])<=500:raise ValueError('Finding bounds')

def ingest(project,job,actor,document,authorize):
    validate(document)
    with storage.storyboard_transaction():
        stored=progressive._read(project,job,actor)
        identity={k:document[k] for k in ['handoffId','consultationId','inputSha256']}
        if stored.get('liveBinding') not in (None,identity):raise HTTPException(409,'Consultation binding changed')
        if not stored.get('liveBinding'):
            stored['provenance']=progressive.Provenance(producer='pythia-showcase-live-v1',sourceIds=[],locators=[],
                consultationId=document['consultationId'],artifactSha256=document['inputSha256']).model_dump()
            stored['events'][0]['provenance']=stored['provenance']
        stored['liveBinding']=identity;stored['liveHandoff']=True;progressive._write(stored)
        for order,f in enumerate(document['findings']):
            provenance=progressive.Provenance(producer='pythia-showcase-live-v1',sourceIds=[f['source_id']],
                locators=[f['unit_label']],consultationId=f['consultation_id'],findingId=f['finding_id'],
                findingRevision=f['revision'],originalSha256=f['original_sha256'],textSha256=f.get('text_sha256'),quote=f['quote'],
                artifactSha256=document['inputSha256'],rationale=f['coverage'])
            progressive.emit_scene(project,job,actor,f['finding_id'][:24],
                {'title':'Pythia finding '+str(order+1),'extractedText':[f.get('content',f['quote'])],
                 'notes':f"Source {f['source_id']} · {f['unit_label']}\nExact quote: {f['quote']}\nOriginal SHA-256: {f['original_sha256']}"},order,authorize,provenance)
        if document['status'] in {'completed','failed','interrupted','cancelled'}:
            progressive.finish(project,job,actor,'completed' if document['status']=='completed' else 'failed',authorize)

_workers=set();_lock=threading.Lock()
def resume(project,job,actor,authorize):
    key=(project,job,actor)
    with _lock:
        if key in _workers:return
        _workers.add(key)
    def run():
        try:
            while True:
                if progressive._read(project,job,actor)['status']!='running':return
                authorize();document=fetch(project,job,actor);ingest(project,job,actor,document,authorize)
                if document['status'] not in {'accepted','running'}:return
                threading.Event().wait(.5)
        except (HTTPException,ValueError):pass # preserve proposals; explicit resume only
        finally:
            with _lock:_workers.discard(key)
    threading.Thread(target=copy_context().run,args=(run,),daemon=True).start()

def authorize_link(project,job,actor):
    stored=progressive._read(project,job,actor)
    if stored.get('liveHandoff'):fetch(project,job,actor)
