(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const files = Array.isArray(window.__UPLOAD_FILES__) ? window.__UPLOAD_FILES__ : [];
    const fileList = document.getElementById('file-list');
    const batchMetadata = document.getElementById('batch-metadata');
    const errorDiv = document.getElementById('error');
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function renderFiles() {
        fileList.innerHTML = '';
        files.forEach((file, index) => {
            const row = document.createElement('div');
            row.className = 'file-row';

            const info = document.createElement('div');
            const fileName = document.createElement('div');
            fileName.className = 'file-name';
            fileName.textContent = file.fileName || file.filePath;
            info.appendChild(fileName);

            const filePath = document.createElement('div');
            filePath.className = 'file-path';
            filePath.textContent = file.filePath || '';
            info.appendChild(filePath);
            row.appendChild(info);

            const metadataInput = document.createElement('textarea');
            metadataInput.className = 'file-metadata';
            metadataInput.placeholder = '{"category":"docs"}';
            metadataInput.dataset.filePath = file.filePath || '';
            metadataInput.dataset.index = String(index);
            row.appendChild(metadataInput);

            fileList.appendChild(row);
        });
    }

    function updatePerFileDisabledState() {
        const useBatch = !!batchMetadata.value.trim();
        document.querySelectorAll('.file-metadata').forEach(el => {
            el.disabled = useBatch;
        });
    }

    function collectPayload() {
        const perFile = Array.from(document.querySelectorAll('.file-metadata')).map(el => ({
            filePath: el.dataset.filePath || '',
            metadata: el.value || ''
        }));

        return {
            batchMetadata: batchMetadata.value || '',
            files: perFile
        };
    }

    submitBtn.addEventListener('click', () => {
        clearError();
        vscode.postMessage({
            command: 'submit',
            payload: collectPayload()
        });
    });

    cancelBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'cancel' });
    });

    batchMetadata.addEventListener('input', () => {
        updatePerFileDisabledState();
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'error') {
            showError(message.message);
        }
    });

    renderFiles();
    updatePerFileDisabledState();
})();
