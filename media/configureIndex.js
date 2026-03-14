(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const tagsList = document.getElementById('tags-list');
    const addTagBtn = document.getElementById('add-tag-btn');
    const saveBtn = document.getElementById('save-btn');
    const indexNameEl = document.getElementById('index-name');
    const deletionProtectionSelect = document.getElementById('deletion-protection');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
        successDiv.classList.add('hidden');
    }

    function showSuccess(message) {
        successDiv.textContent = message || 'Saved';
        successDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
    }

    function clearMessages() {
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
    }

    function addTagRow(key, value) {
        const row = document.createElement('div');
        row.className = 'tag-row';

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = 'Key';
        keyInput.value = key || '';
        keyInput.className = 'tag-key';
        row.appendChild(keyInput);

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Value';
        valueInput.value = value || '';
        valueInput.className = 'tag-value';
        row.appendChild(valueInput);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'secondary';
        removeBtn.addEventListener('click', () => row.remove());
        row.appendChild(removeBtn);

        tagsList.appendChild(row);
    }

    function setTags(tags) {
        tagsList.innerHTML = '';
        const entries = Object.entries(tags || {});
        if (entries.length === 0) {
            addTagRow('', '');
            return;
        }
        entries.forEach(([key, value]) => addTagRow(key, String(value)));
    }

    function collectTags() {
        const rows = Array.from(document.querySelectorAll('.tag-row'));
        const tags = [];
        for (const row of rows) {
            const keyInput = row.querySelector('.tag-key');
            const valueInput = row.querySelector('.tag-value');
            const key = (keyInput && keyInput.value ? keyInput.value : '').trim();
            const value = valueInput && valueInput.value ? valueInput.value : '';
            if (!key) {
                if (value.trim()) {
                    return { error: 'Tag keys cannot be empty when a value is provided.' };
                }
                continue;
            }
            tags.push({ key, value });
        }
        return { tags };
    }

    addTagBtn.addEventListener('click', () => {
        clearMessages();
        addTagRow('', '');
    });

    saveBtn.addEventListener('click', () => {
        clearMessages();
        const collected = collectTags();
        if (collected.error) {
            showError(collected.error);
            return;
        }
        saveBtn.disabled = true;
        vscode.postMessage({
            command: 'submit',
            payload: {
                deletionProtection: deletionProtectionSelect.value,
                tags: collected.tags
            }
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'init':
                if (indexNameEl && message.indexName) {
                    indexNameEl.textContent = message.indexName;
                }
                deletionProtectionSelect.value = message.deletionProtection || 'disabled';
                setTags(message.tags || {});
                saveBtn.disabled = false;
                clearMessages();
                break;
            case 'success':
                saveBtn.disabled = false;
                showSuccess(message.message || 'Configuration saved.');
                break;
            case 'error':
                saveBtn.disabled = false;
                showError(message.message);
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
