(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const indexNameEl = document.getElementById('index-name');
    const refreshBtn = document.getElementById('refresh-btn');
    const cancelBackupBtn = document.getElementById('cancel-backup-btn');
    const createBackupBtn = document.getElementById('create-backup-btn');
    const backupNameInput = document.getElementById('backup-name-input');
    const restoreBackupBtn = document.getElementById('restore-backup-btn');
    const deleteBackupBtn = document.getElementById('delete-backup-btn');
    const backupsContainer = document.getElementById('active-backups');
    const allBackupsContainer = document.getElementById('all-backups');
    const restoresContainer = document.getElementById('active-restores');
    const statusText = document.getElementById('status-text');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');

    let activeBackups = [];
    let allBackups = [];

    if (restoreBackupBtn) {
        restoreBackupBtn.disabled = true;
    }
    if (deleteBackupBtn) {
        deleteBackupBtn.disabled = true;
    }

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
        successDiv.classList.add('hidden');
    }

    function showSuccess(message) {
        successDiv.textContent = message || 'Done';
        successDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
    }

    function clearMessages() {
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
    }

    function toLocaleDate(dateStr) {
        if (!dateStr) {
            return 'Unknown';
        }
        const parsed = new Date(dateStr);
        if (Number.isNaN(parsed.getTime())) {
            return dateStr;
        }
        return parsed.toLocaleString();
    }

    function renderActiveBackups(backups) {
        activeBackups = Array.isArray(backups) ? backups : [];
        backupsContainer.innerHTML = '';

        if (activeBackups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No active backup jobs.';
            backupsContainer.appendChild(empty);
            cancelBackupBtn.disabled = true;
            return;
        }

        activeBackups.forEach((backup, index) => {
            const row = document.createElement('label');
            row.className = 'job-select-row';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'active-backup-job';
            radio.value = backup.backup_id || '';
            radio.checked = index === 0;
            row.appendChild(radio);

            const content = document.createElement('div');
            content.className = 'job-content';

            const title = document.createElement('div');
            title.className = 'job-title';
            title.textContent = backup.name || backup.backup_id || 'Unnamed backup';
            content.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'job-meta';
            const recordCount = typeof backup.record_count === 'number'
                ? backup.record_count.toLocaleString()
                : '...';
            meta.textContent = `${backup.status || 'Unknown'} | ${recordCount} records | ${toLocaleDate(backup.created_at)}`;
            content.appendChild(meta);

            row.appendChild(content);
            backupsContainer.appendChild(row);
        });

        cancelBackupBtn.disabled = false;
    }

    function renderAllBackups(backups) {
        allBackups = Array.isArray(backups) ? backups : [];
        if (!allBackupsContainer) {
            return;
        }
        allBackupsContainer.innerHTML = '';

        if (allBackups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No backups found for this index.';
            allBackupsContainer.appendChild(empty);
            if (restoreBackupBtn) {
                restoreBackupBtn.disabled = true;
            }
            if (deleteBackupBtn) {
                deleteBackupBtn.disabled = true;
            }
            return;
        }

        allBackups.forEach((backup, index) => {
            const row = document.createElement('label');
            row.className = 'job-select-row';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'all-backup';
            radio.value = backup.backup_id || '';
            radio.checked = index === 0;
            row.appendChild(radio);

            const content = document.createElement('div');
            content.className = 'job-content';

            const title = document.createElement('div');
            title.className = 'job-title';
            title.textContent = backup.name || backup.backup_id || 'Unnamed backup';
            content.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'job-meta';
            const namespaceCount = typeof backup.namespace_count === 'number'
                ? backup.namespace_count.toLocaleString()
                : '...';
            meta.textContent = `${backup.status || 'Unknown'} | ${namespaceCount} namespaces | ${toLocaleDate(backup.created_at)}`;
            content.appendChild(meta);

            const detail = document.createElement('div');
            detail.className = 'job-detail';
            detail.textContent = `Backup ID: ${backup.backup_id || 'unknown'} | Source: ${backup.source_index_name || 'unknown'}`;
            content.appendChild(detail);

            row.appendChild(content);
            allBackupsContainer.appendChild(row);
        });

        if (restoreBackupBtn) {
            restoreBackupBtn.disabled = false;
        }
        if (deleteBackupBtn) {
            deleteBackupBtn.disabled = false;
        }
    }

    function renderActiveRestores(restores) {
        const jobs = Array.isArray(restores) ? restores : [];
        restoresContainer.innerHTML = '';

        if (jobs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No active restore jobs.';
            restoresContainer.appendChild(empty);
            return;
        }

        jobs.forEach((job) => {
            const row = document.createElement('div');
            row.className = 'job-row';

            const title = document.createElement('div');
            title.className = 'job-title';
            title.textContent = job.target_index_name || job.target_index_id || 'Restore job';
            row.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'job-meta';
            const progress = typeof job.percent_complete === 'number'
                ? `${job.percent_complete}%`
                : 'unknown';
            meta.textContent = `${job.status || 'Unknown'} | ${progress} | Started ${toLocaleDate(job.created_at)}`;
            row.appendChild(meta);

            const detail = document.createElement('div');
            detail.className = 'job-detail';
            detail.textContent = `Restore Job: ${job.restore_job_id || 'unknown'} | Backup: ${job.backup_id || 'unknown'}`;
            row.appendChild(detail);

            restoresContainer.appendChild(row);
        });
    }

    function getSelectedBackup() {
        const selected = document.querySelector('input[name="active-backup-job"]:checked');
        if (!selected) {
            return undefined;
        }

        return activeBackups.find((backup) => backup.backup_id === selected.value);
    }

    function getSelectedRestoreBackup() {
        const selected = document.querySelector('input[name="all-backup"]:checked');
        if (!selected) {
            return undefined;
        }
        return allBackups.find((backup) => backup.backup_id === selected.value);
    }

    refreshBtn.addEventListener('click', () => {
        clearMessages();
        vscode.postMessage({ command: 'refresh' });
    });

    cancelBackupBtn.addEventListener('click', () => {
        clearMessages();
        const selected = getSelectedBackup();
        if (!selected) {
            showError('Select an active backup job to cancel.');
            return;
        }

        vscode.postMessage({
            command: 'cancelBackup',
            payload: {
                backupId: selected.backup_id,
                backupName: selected.name
            }
        });
    });

    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', () => {
            clearMessages();
            const backupName = backupNameInput ? backupNameInput.value.trim() : '';
            if (!backupName) {
                showError('Enter a backup name.');
                return;
            }
            vscode.postMessage({
                command: 'createBackup',
                payload: {
                    name: backupName
                }
            });
        });
    }

    if (restoreBackupBtn) {
        restoreBackupBtn.addEventListener('click', () => {
            clearMessages();
            const selected = getSelectedRestoreBackup();
            if (!selected) {
                showError('Select a backup to restore.');
                return;
            }

            vscode.postMessage({
                command: 'restoreBackup',
                payload: {
                    backupId: selected.backup_id,
                    backupName: selected.name,
                    sourceIndexName: selected.source_index_name,
                    status: selected.status
                }
            });
        });
    }

    if (deleteBackupBtn) {
        deleteBackupBtn.addEventListener('click', () => {
            clearMessages();
            const selected = getSelectedRestoreBackup();
            if (!selected) {
                showError('Select a backup to delete.');
                return;
            }

            vscode.postMessage({
                command: 'deleteBackup',
                payload: {
                    backupId: selected.backup_id,
                    backupName: selected.name
                }
            });
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'setIndex':
                if (indexNameEl && message.indexName) {
                    indexNameEl.textContent = message.indexName;
                }
                break;
            case 'jobsData':
                renderActiveBackups(message.backups || []);
                renderAllBackups(message.allBackups || []);
                renderActiveRestores(message.restoreJobs || []);
                if (statusText) {
                    statusText.textContent = `Last refreshed: ${toLocaleDate(message.refreshedAt)}`;
                }
                break;
            case 'error':
                showError(message.message);
                break;
            case 'success':
                showSuccess(message.message);
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
