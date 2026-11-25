"""Disposable team-mode Chimera fixture. Never imports a real workspace."""
import argparse,json,os,sys
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--config',type=Path,required=True);parser.add_argument('--port',type=int,required=True);args=parser.parse_args()
config=json.loads(args.config.read_text());assert config['qualification_only'] and config['chimeraNativeToken'].startswith('synthetic-')
root=Path(config['chimeraState']);root.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
os.environ.update(CHIMERA_WORKSPACE=str(root/'workspace'),CHIMERA_DEPLOYMENT_PROFILE='networked',
    CHIMERA_PUBLIC_ORIGIN=config['chimeraOrigin'],CHIMERA_PROGRESSIVE_HANDOFF_ENABLED='true',
    CHIMERA_PYTHIA_NATIVE_BASE_URL=config['origin']+'/v1/chimera-engine',CHIMERA_PYTHIA_NATIVE_API_KEY=config['chimeraNativeToken'])
from backend.app.password_auth import AccountStore
store=AccountStore(root/'workspace')
if not store.accounts():
    uid=store.provision('author@p01.example',config['chimeraPassword'],'P01 Author',['author','instructional-designer'])
    outsider=store.provision('outsider@p01.example',config['chimeraPassword'],'P01 Outsider',['author'])
    (root/'actor.json').write_text(json.dumps({'actorId':uid,'outsiderId':outsider}))
from backend.app.main import app
import uvicorn
uvicorn.run(app,host='127.0.0.1',port=args.port,log_level='warning')
