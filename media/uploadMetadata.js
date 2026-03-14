(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const files = Array.isArray(window.__UPLOAD_FILES__) ? window.__UPLOAD_FILES__ : [];
    const fileList = document.getElementById('file-list');
    const batchMetadata = document.getElementById('batch-metadata');
    const batchMultimodalToggle = document.getElementById('batch-multimodal-toggle');
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

            const multimodalOption = document.createElement('label');
            multimodalOption.className = 'file-multimodal-label';
            const multimodalInput = document.createElement('input');
            multimodalInput.type = 'checkbox';
            multimodalInput.className = 'file-multimodal';
            multimodalInput.dataset.filePath = file.filePath || '';
            multimodalOption.appendChild(multimodalInput);
            multimodalOption.append(' Upload as multimodal');
            row.appendChild(multimodalOption);

            fileList.appendChild(row);
        });
    }

    function updatePerFileDisabledState() {
        const useBatch = !!batchMetadata.value.trim();
        const useBatchMultimodal = batchMultimodalToggle ? !!batchMultimodalToggle.checked : false;
        document.querySelectorAll('.file-metadata').forEach(el => {
            el.disabled = useBatch;
        });
        document.querySelectorAll('.file-multimodal').forEach(el => {
            el.disabled = useBatchMultimodal;
        });
    }

    function collectPayload() {
        const perFileMetadata = Array.from(document.querySelectorAll('.file-metadata'));
        const perFileMultimodal = new Map(
            Array.from(document.querySelectorAll('.file-multimodal')).map(el => [el.dataset.filePath || '', !!el.checked])
        );
        const perFile = perFileMetadata.map(el => ({
            filePath: el.dataset.filePath || '',
            metadata: el.value || '',
            multimodal: perFileMultimodal.get(el.dataset.filePath || '') || false
        }));

        return {
            batchMetadata: batchMetadata.value || '',
            batchMultimodal: batchMultimodalToggle ? !!batchMultimodalToggle.checked : false,
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
    if (batchMultimodalToggle) {
        batchMultimodalToggle.addEventListener('change', () => {
            updatePerFileDisabledState();
        });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'error') {
            showError(message.message);
        }
    });

    renderFiles();
    updatePerFileDisabledState();
})();
