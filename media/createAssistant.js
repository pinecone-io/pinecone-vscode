(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const nameInput = document.getElementById('assistant-name');
    const regionSelect = document.getElementById('assistant-region');
    const regionHint = document.getElementById('assistant-region-hint');
    const instructionsInput = document.getElementById('assistant-instructions');
    const metadataInput = document.getElementById('assistant-metadata');
    const createBtn = document.getElementById('create-btn');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    let isFreeTier = false;

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
        successDiv.classList.add('hidden');
    }

    function showSuccess(message) {
        successDiv.textContent = message || 'Assistant created.';
        successDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
    }

    function clearMessages() {
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
        errorDiv.textContent = '';
        successDiv.textContent = '';
    }

    createBtn.addEventListener('click', () => {
        clearMessages();
        createBtn.disabled = true;
        vscode.postMessage({
            command: 'submit',
            payload: {
                name: nameInput.value,
                region: regionSelect.value,
                instructions: instructionsInput.value,
                metadata: metadataInput.value
            }
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'init':
                isFreeTier = !!message.isFreeTier;
                regionSelect.value = message.defaultRegion === 'eu' ? 'eu' : 'us';
                if (isFreeTier) {
                    regionSelect.value = message.freeTierRegion || 'us';
                    regionSelect.disabled = true;
                    if (regionHint) {
                        regionHint.textContent = `Free tier assistants are limited to region "${regionSelect.value}".`;
                    }
                } else {
                    regionSelect.disabled = false;
                    if (regionHint) {
                        regionHint.textContent = '';
                    }
                }
                break;
            case 'success':
                createBtn.disabled = false;
                showSuccess(message.message);
                break;
            case 'error':
                createBtn.disabled = false;
                showError(message.message);
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
