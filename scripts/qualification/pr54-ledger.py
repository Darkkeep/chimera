import pathlib,json,ssl,urllib.request,urllib.error,hashlib,subprocess,time
root=pathlib.Path('/srv/chimera2-staging/state/qualification-pr54-4a38e49')
workspace=root/'workspace'
import argparse
parser=argparse.ArgumentParser(description='Synthetic PR54 staging ledger/restart checks; never production')
parser.add_argument('project_id');project_id=parser.parse_args().project_id
assert project_id.startswith('pr54-independent-release-qualification-')
accounts=json.loads((root/'test-accounts.json').read_text())
ctx=ssl._create_unverified_context();base='https://127.0.0.1:8002';origin='https://localhost:18002'
def call(route,method='GET',body=None,cookie=None):
 headers={'Origin':origin}
 if cookie:headers['Cookie']=cookie
 if body is not None:headers['Content-Type']='application/json'
 req=urllib.request.Request(base+route,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(req,context=ctx,timeout=15) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
cookies={}
for label in ['author','reviewer']:
 code,body,h=call('/api/auth/login','POST',accounts[label]);assert code==200;cookies[label]=h['Set-Cookie'].split(';')[0]
route='/api/projects/'+project_id
code,body,_=call(route,cookie=cookies['author']);assert code==200;project=json.loads(body)
code,body,_=call(route+'/review-approval','POST',dict(decision='approve',expectedRevision=project['storyboard']['revision'],note='Ledger integrity staging check'),cookies['reviewer']);assert code==200,body
status=json.loads(body);assert status['approved'];assert status['lastDecision']['actorId']==accounts['reviewer']['id']
p=workspace/'review-ledger'/(hashlib.sha256(project_id.encode()).hexdigest()+'.json');original=p.read_bytes();evidence=root/'ledger-integrity-evidence';evidence.mkdir(mode=0o700,exist_ok=True);(evidence/'original-ledger.json').write_bytes(original)
results=[]
try:
 entries=json.loads(original);entries[0]['note']='Modified existing receipt without resealing';p.write_text(json.dumps(entries))
 for suffix in ['/review-approval','/scorm-12.zip?approved=true','/scorm-2004.zip?approved=true','/standalone.zip?approved=true']:
  code,body,_=call(route+suffix,cookie=cookies['author']);assert code>=400 and not body.startswith(b'PK');results.append(dict(check=suffix,status=code,result='FAIL_CLOSED'))
 p.write_text('{invalid-json')
 code,body,_=call(route+'/scorm-12.zip?approved=true',cookie=cookies['author']);assert code>=400 and not body.startswith(b'PK');results.append(dict(check='malformed ledger',status=code,result='FAIL_CLOSED'))
finally:p.write_bytes(original)
code,body,_=call(route+'/review-approval',cookie=cookies['author']);assert code==200 and json.loads(body)['approved']
events=[json.loads(line) for line in (workspace/'projects'/project_id/'audit/events.jsonl').read_text().splitlines()]
assert any(x['eventName']=='review.approved' and x['actorId']==accounts['reviewer']['id'] for x in events)
before={str(x.relative_to(workspace)):hashlib.file_digest(x.open('rb'),'sha256').hexdigest() for x in workspace.rglob('*') if x.is_file()}
subprocess.run(['systemctl','restart','chimera2-pr54-4a38e49-staging.service'],check=True)
for _ in range(40):
 try:
  code,_,_=call('/api/health')
  if code==200:break
 except OSError:time.sleep(.25)
after={str(x.relative_to(workspace)):hashlib.file_digest(x.open('rb'),'sha256').hexdigest() for x in workspace.rglob('*') if x.is_file()};assert before==after
code,body,_=call(route,cookie=cookies['author']);assert code==200 and json.loads(body)['storyboard']==project['storyboard']
print(json.dumps(dict(ledgerChecks=results,auditAttribution='PASS',stagingRestartPersistence='PASS',matchedWorkspaceFiles=len(before),syntheticLedgerRestored=True)))
