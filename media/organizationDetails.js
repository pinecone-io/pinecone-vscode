(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const organizationName = document.getElementById('organization-name');
    const refreshBtn = document.getElementById('refresh-btn');
    const errorDiv = document.getElementById('error');
    const detailsCard = document.getElementById('details-card');
    const detailsTable = document.getElementById('details-table');

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
            return 'Not available';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString();
    }

    function formatValue(value) {
        if (value === null || value === undefined || value === '') {
            return 'Not available';
        }
        return String(value);
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
            valueCell.innerHTML = escapeHtml(rawValue);
            row.appendChild(valueCell);

            table.appendChild(row);
        });
    }

    function renderDetails(details) {
        const rows = [
            ['Organization ID', formatValue(details.id)],
            ['Name', formatValue(details.name)],
            ['Plan', formatValue(details.plan)],
            ['Support Tier', formatValue(details.supportTier)],
            ['Payment Status', formatValue(details.paymentStatus)],
            ['Created At', formatDate(details.createdAt)]
        ];
        renderTable(detailsTable, rows);
        detailsCard.classList.remove('hidden');
    }

    refreshBtn.addEventListener('click', () => {
        clearError();
        vscode.postMessage({ command: 'refresh' });
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'details':
                clearError();
                if (message.organizationName) {
                    organizationName.textContent = message.organizationName;
                }
                renderDetails(message.details || {});
                break;
            case 'error':
                showError(message.message);
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
