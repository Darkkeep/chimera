"""Discover executable media connections from existing installation settings."""
import os
from . import ai_connection, narration_connections, pythia_media
from .learning_intelligence import PythiaProvider, PythiaUnavailableError

KINDS = ('scene', 'image', 'narration', 'video')


def connection_catalog(root):
    legacy = ai_connection.connection_status(root)
    saved = narration_connections.narration_status(root)
    connections = []
    if pythia_media.enabled() or (root / "pythia-connection.json").is_file() or os.environ.get("CHIMERA_PYTHIA_BASE_URL"):
        image, outputs = pythia_media.image_status(), pythia_media.media_status()
        ready = [kind for kind in ('scene', 'narration') if outputs.get('configured') and outputs.get('models', {}).get(kind)]
        if image.get('configured'):
            ready.append('image')
        connections.append({'id': 'pythia', 'name': 'Pythia', 'provider': 'pythia', 'executor': 'pythia',
            'configured': bool(ready), 'readyFor': ready, 'supports': ['scene', 'image', 'narration'],
            'models': {**outputs.get('models', {}), 'image': image.get('imageModel', '')},
            'revisions': {**{kind: 'pythia-media-' + outputs.get('revision', '') for kind in ('scene', 'narration')}, 'image': image.get('revision', '')},
            'voice': outputs.get('default_voice', 'alloy'), 'language': 'en-US',
            'reason': '' if ready else 'Pythia is unavailable or media execution is disabled.'})
    connections.append({'id': 'legacy-openai', 'name': 'OpenAI / compatible connection', 'provider': legacy['provider'],
        'executor': 'chimera', 'configured': legacy['configured'], 'supports': ['scene', 'image', 'narration'],
        'readyFor': ['scene', 'image', 'narration'] if legacy['configured'] else [],
        'models': {'scene': legacy.get('textModel', ''), 'image': legacy.get('imageModel', ''), 'narration': legacy.get('audioModel', '')},
        'revisions': {kind: legacy['revision'] for kind in ('scene', 'image', 'narration')},
        'voice': 'alloy', 'language': 'en-US', 'reason': '' if legacy['configured'] else 'Configure this connection in Settings > AI Connections.'})
    for item in saved['connections']:
        speech = item['provider'] in narration_connections.SPEECH_PROVIDERS
        ready = speech and item['configured'] and bool(item['voice'])
        reason = '' if ready else 'Save a narration voice.' if speech and item['configured'] else 'Configure credentials.' if speech else 'Connection setup only; video generation is not implemented for this provider.'
        connections.append({'id': item['id'], 'name': item['name'], 'provider': item['provider'], 'executor': 'chimera',
            'configured': item['configured'], 'supports': ['narration'] if speech else ['video'], 'readyFor': ['narration'] if ready else [],
            'models': {'narration': item['model']} if speech else {}, 'revisions': {'narration': item['revision']} if speech else {},
            'voice': item['voice'], 'language': item['language'], 'reason': reason})
    defaults = {kind: next((item['id'] for item in connections if kind in item['readyFor']), None) for kind in KINDS}
    return {'connections': connections, 'defaults': defaults,
        'videoUnavailableReason': '' if defaults['video'] else 'No configured connection can generate video clips. Check Settings > AI Connections; setup-only connections cannot generate yet.'}


def select_connection(root, kind, identifier=None):
    if kind not in KINDS:
        raise ValueError('Unsupported media type')
    catalog = connection_catalog(root)
    identifier = identifier or catalog['defaults'][kind]
    selected = next((item for item in catalog['connections'] if item['id'] == identifier), None)
    if selected is None or kind not in selected['readyFor']:
        raise ValueError('The selected connection is unavailable for this media type. Check Settings > AI Connections and select a configured provider.')
    # Pythia checks the same secret-free inventory whenever it is available.
    if any(item['id'] == 'pythia' and item['configured'] for item in catalog['connections']):
        options = [{'id': item['id'], 'provider': item['provider'], 'executor': item['executor'],
                    'readyFor': item['readyFor'], 'revision': item['revisions'].get(kind, ''), 'model': item['models'].get(kind, '')}
                   for item in catalog['connections']]
        try:
            decision = PythiaProvider().resolve_media_connection({'kind': kind, 'connection_id': identifier, 'connections': options})
            if decision.get('connection') != next(item for item in options if item['id'] == identifier):
                raise ValueError('Pythia returned a mismatched connection selection')
        except PythiaUnavailableError:
            if selected['executor'] == 'pythia':
                raise RuntimeError('Pythia could not verify the selected connection. No alternate provider was used.') from None
    return selected
