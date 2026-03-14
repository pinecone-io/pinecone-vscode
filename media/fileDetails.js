(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const fileLabel = document.getElementById('file-label');
    const refreshBtn = document.getElementById('refresh-btn');
    const errorDiv = document.getElementById('error');
    const detailsCard = document.getElementById('details-card');
    const detailsTable = document.getElementById('details-table');
    const metadataCard = document.getElementById('metadata-card');
    const metadataTable = document.getElementById('metadata-table');
    const previewText = document.getElementById('preview-text');
    const previewError = document.getElementById('preview-error');
    const previewPdf = document.getElementById('preview-pdf');

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    }

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString();
    }

    function formatBytes(size) {
        if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
            return '';
        }
        if (size < 1024) {
            return `${size} B`;
        }
        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = size;
        let unitIndex = -1;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
        return `${value.toFixed(precision)} ${units[unitIndex]}`;
    }

    function renderTable(table, rows) {
        table.innerHTML = '';
        rows.forEach(([key, rawValue]) => {
            const row = document.createElement('tr');

            const keyCell = document.createElement('td');
            keyCell.className = 'metadata-key';
            keyCell.textContent = key;
            row.appendChild(keyCell);

            const valueCell = document.createElement('td');
            valueCell.className = 'metadata-value';
            if (rawValue instanceof HTMLElement) {
                valueCell.appendChild(rawValue);
            } else {
                valueCell.innerHTML = escapeHtml(rawValue);
            }
            row.appendChild(valueCell);

            table.appendChild(row);
        });
    }

    function signedUrlNode(url) {
        if (!url) {
            return 'Not available';
        }
        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
    }

    function renderDetails(details) {
        const detailRows = [
            ['Name', details.name || ''],
            ['Signed URL', signedUrlNode(details.signedUrl || '')],
            ['Created On', formatDate(details.createdOn)],
            ['Updated On', formatDate(details.updatedOn)],
            ['Status', details.status || ''],
            ['Error Message', details.errorMessage || ''],
            ['multimodal', details.multimodal ? 'true' : 'false'],
            ['Indexed Size', formatBytes(details.indexedSizeBytes)],
            ['Signed URL Size', formatBytes(details.signedUrlSizeBytes)],
            ['Signed URL Content-Type', details.contentType || '']
        ];
        renderTable(detailsTable, detailRows);
        detailsCard.classList.remove('hidden');

        const metadata = details.metadata && typeof details.metadata === 'object' ? details.metadata : {};
        const metadataEntries = Object.entries(metadata);
        if (metadataEntries.length === 0) {
            metadataCard.classList.add('hidden');
        } else {
            renderTable(metadataTable, metadataEntries.map(([key, value]) => {
                if (value && typeof value === 'object') {
                    return [key, JSON.stringify(value, null, 2)];
                }
                return [key, String(value)];
            }));
            metadataCard.classList.remove('hidden');
        }

        resetPreview();

        if (details.previewMode === 'pdf') {
            showPreviewUnavailable(
                details.previewError || 'Unable to generate PDF preview in this view.',
                details.signedUrl
            );
            return;
        }

        if (details.previewMode === 'text' && details.previewText) {
            previewText.textContent = details.previewText;
            previewText.classList.remove('hidden');
            return;
        }

        showPreviewUnavailable(
            details.previewError || 'Preview is unavailable for this file.',
            details.signedUrl
        );
    }

    function resetPreview() {
        previewError.classList.add('hidden');
        previewError.innerHTML = '';
        if (previewPdf) {
            previewPdf.classList.add('hidden');
            previewPdf.removeAttribute('src');
        }
        previewText.classList.add('hidden');
        previewText.textContent = '';
    }

    function showPreviewUnavailable(message, signedUrl) {
        const container = document.createElement('div');
        container.className = 'preview-unavailable';

        const messageNode = document.createElement('span');
        messageNode.textContent = message || 'Preview is unavailable for this file.';
        container.appendChild(messageNode);

        if (signedUrl) {
            const downloadLink = document.createElement('a');
            downloadLink.href = signedUrl;
            downloadLink.textContent = 'Download file';
            downloadLink.target = '_blank';
            downloadLink.rel = 'noopener noreferrer';
            downloadLink.className = 'download-link';
            container.appendChild(downloadLink);
        }

        previewError.innerHTML = '';
        previewError.appendChild(container);
        previewError.classList.remove('hidden');
    }

    refreshBtn.addEventListener('click', () => {
        clearError();
        vscode.postMessage({ command: 'refresh' });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'details':
                clearError();
                if (message.fileLabel) {
                    fileLabel.textContent = message.fileLabel;
                }
                renderDetails(message.details || {});
                break;
            case 'error':
                showError(message.message);
                break;
            case 'authExpired':
                showError('Authentication expired. Please login again.');
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
