"""Client-side ceilings negotiated against the engine's advertised capacity."""
import os


DEFAULTS = {'contextChars': 200_000, 'messageChars': 100_000,
            'historyMessages': 100, 'requestBytes': 1_048_576}
MAXIMA = {'contextChars': 2_000_000, 'messageChars': 100_000,
          'historyMessages': 100, 'requestBytes': 8_388_608}
ENV_NAMES = {'contextChars': 'CHIMERA_PYTHIA_CONTEXT_CHARS',
             'messageChars': 'CHIMERA_PYTHIA_MESSAGE_CHARS',
             'historyMessages': 'CHIMERA_PYTHIA_HISTORY_MESSAGES',
             'requestBytes': 'CHIMERA_PYTHIA_REQUEST_BYTES'}
LEGACY = {**DEFAULTS, 'contextChars': 24_000, 'requestBytes': 262_144}


def negotiate(advertised):
    legacy = advertised is None
    remote = LEGACY if legacy else advertised
    if not isinstance(remote, dict):
        raise ValueError('Pythia advertised invalid consultation capacity')
    result = {'verified': not legacy, 'warningPercent': 80}
    for field, default in DEFAULTS.items():
        raw = os.environ.get(ENV_NAMES[field], str(default)).strip()
        if not raw.isascii() or not raw.isdecimal() or not 1 <= int(raw) <= MAXIMA[field]:
            raise ValueError(f'{ENV_NAMES[field]} must be a whole number between 1 and {MAXIMA[field]}')
        value = remote.get(field)
        if type(value) is not int or not 1 <= value <= MAXIMA[field]:
            raise ValueError('Pythia advertised invalid consultation capacity')
        result[field] = min(int(raw), value)
    for field in ('modelContextTokens', 'outputTokens', 'safetyTokens', 'modelFixedInputBytes'):
        value = remote.get(field)
        if value is not None:
            if type(value) is not int or not 0 <= value <= 4_000_000:
                raise ValueError('Pythia advertised invalid model capacity')
            result[field] = value
    if remote.get('tokenCounting') == 'conservative-utf8-bytes':
        result['tokenCounting'] = remote['tokenCounting']
        required = {'modelContextTokens', 'outputTokens', 'safetyTokens', 'modelFixedInputBytes'}
        if not required <= result.keys():
            raise ValueError('Pythia advertised incomplete model capacity')
        result['modelInputTokens'] = result['modelContextTokens'] - result['outputTokens'] - result['safetyTokens']
        if result['modelInputTokens'] <= result['modelFixedInputBytes']:
            raise ValueError('Pythia advertised invalid model capacity')
    return result
