(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const tagsList = document.getElementById('tags-list');
    const addTagBtn = document.getElementById('add-tag-btn');
    const saveBtn = document.getElementById('save-btn');
    const indexNameEl = document.getElementById('index-name');
    const deletionProtectionSelect = document.getElementById('deletion-protection');
    const readCapacityMode = document.getElementById('read-capacity-mode');
    const readCapacityNodeType = document.getElementById('read-capacity-node-type');
    const readCapacityReplicas = document.getElementById('read-capacity-replicas');
    const readCapacityShards = document.getElementById('read-capacity-shards');
    const dedicatedReadCapacity = document.getElementById('dedicated-read-capacity');
    const readCapacityHint = document.getElementById('read-capacity-hint');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    let hasIntegratedEmbeddings = false;
    let canSwitchToOnDemand = true;

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

    function setReadCapacityMode() {
        const mode = readCapacityMode.value || 'OnDemand';
        if (mode === 'Dedicated') {
            dedicatedReadCapacity.classList.remove('hidden');
            return;
        }
        dedicatedReadCapacity.classList.add('hidden');
    }

    function setReadCapacityEditableState() {
        const disabled = hasIntegratedEmbeddings;
        readCapacityMode.disabled = disabled;
        readCapacityNodeType.disabled = disabled;
        readCapacityReplicas.disabled = disabled;
        readCapacityShards.disabled = disabled;

        const onDemandOption = readCapacityMode.querySelector('option[value="OnDemand"]');
        if (onDemandOption) {
            onDemandOption.disabled = !canSwitchToOnDemand;
        }

        if (!canSwitchToOnDemand && readCapacityMode.value === 'OnDemand') {
            readCapacityMode.value = 'Dedicated';
        }

        if (disabled) {
            readCapacityHint.textContent = 'Dedicated Read Nodes are disabled for integrated embedding indexes in this extension.';
            dedicatedReadCapacity.classList.add('hidden');
            return;
        }
        if (!canSwitchToOnDemand) {
            readCapacityHint.textContent = 'This index is currently Dedicated. Switching back to OnDemand is not supported in this extension.';
        } else {
            readCapacityHint.textContent = 'Use OnDemand or configure Dedicated Read Nodes for BYOV indexes.';
        }
        setReadCapacityMode();
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

    readCapacityMode.addEventListener('change', () => {
        clearMessages();
        setReadCapacityMode();
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
                tags: collected.tags,
                readCapacity: {
                    mode: readCapacityMode.value,
                    nodeType: readCapacityNodeType.value,
                    replicas: readCapacityReplicas.value,
                    shards: readCapacityShards.value
                }
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
                hasIntegratedEmbeddings = !!message.hasIntegratedEmbeddings;
                canSwitchToOnDemand = message.canSwitchToOnDemand !== false;
                const readCapacity = message.readCapacity || {};
                readCapacityMode.value = readCapacity.mode || 'OnDemand';
                readCapacityNodeType.value = readCapacity.nodeType || 'b1';
                readCapacityReplicas.value = readCapacity.replicas || '1';
                readCapacityShards.value = readCapacity.shards || '1';
                setReadCapacityEditableState();
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
