"""Fixed local adapter failure messages, safe for browser display."""
FAILURE_MESSAGES = {
    'authentication': 'Pythia provider authentication failed. Check the installed plugin provider connection.',
    'permission': 'The Pythia provider denied this request. Check model access and provider permissions.',
    'rate_limit': 'The Pythia provider reported a rate or quota limit. Check its allowance before retrying.',
    'provider_rejected': 'The Pythia provider rejected the request. Check model and request compatibility.',
    'connection': 'Pythia could not reach its provider or the provider timed out. No automatic retry was made.',
    'invalid_result': 'Pythia returned a response that failed the required content schema. Nothing was applied.',
    'provider_failed': 'The Pythia provider operation failed. No automatic retry was made.',
    'adapter_contract': 'The installed Pythia adapter rejected the request contract. Update the adapter before retrying.',
}
