(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const errorDiv = document.getElementById('error');
    const indexNameSpan = document.getElementById('index-name');
    const upsertVectorSection = document.getElementById('upsert-vector-section');
    const upsertRecordsSection = document.getElementById('upsert-records-section');
    const upsertModeHint = document.getElementById('upsert-mode-hint');
    const importsSection = document.getElementById('imports-section');
    const activeImportsList = document.getElementById('active-imports-list');
    const activeImportsEmpty = document.getElementById('active-imports-empty');
    const cancelImportBtn = document.getElementById('cancel-import-btn');
    let activeImports = [];
    let selectedActiveImportId = '';
    let importsDisabled = false;

    const actionResultIds = {
        upsertVectors: 'result-upsertVectors',
        upsertRecords: 'result-upsertRecords',
        fetchVectors: 'result-fetchVectors',
        fetchByMetadata: 'result-fetchByMetadata',
        updateVector: 'result-updateVector',
        updateByMetadata: 'result-updateByMetadata',
        deleteVectors: 'result-deleteVectors',
        listVectorIds: 'result-listVectorIds',
        startImport: 'result-startImport',
        cancelImport: 'result-cancelImport'
    };

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function checked(id) {
        const el = document.getElementById(id);
        return !!(el && el.checked);
    }

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function clearSectionResult(action) {
        const id = actionResultIds[action];
        if (!id) {
            return;
        }
        const sectionResult = document.getElementById(id);
        if (!sectionResult) {
            return;
        }
        sectionResult.classList.add('hidden');
        sectionResult.innerHTML = '';
    }

    function formatDate(value) {
        if (!value) {
            return 'Unknown';
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return String(value);
        }
        return parsed.toLocaleString();
    }

    function updateCancelImportState() {
        if (!cancelImportBtn) {
            return;
        }
        cancelImportBtn.disabled = !selectedActiveImportId;
    }

    function renderActiveImports(imports) {
        activeImports = Array.isArray(imports) ? imports : [];
        if (!activeImportsList || !activeImportsEmpty) {
            return;
        }

        const selectedBefore = selectedActiveImportId;
        activeImportsList.innerHTML = '';

        if (activeImports.length === 0) {
            selectedActiveImportId = '';
            activeImportsEmpty.textContent = 'No active import jobs.';
            activeImportsEmpty.className = 'jobs-summary empty-result';
            updateCancelImportState();
            return;
        }

        const hasExistingSelection = activeImports.some((job) => String(job.id || '') === selectedBefore);
        selectedActiveImportId = hasExistingSelection ? selectedBefore : String(activeImports[0].id || '');

        activeImports.forEach((job) => {
            const row = document.createElement('label');
            row.className = 'job-select-row';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'active-import-job';
            radio.value = String(job.id || '');
            radio.checked = radio.value === selectedActiveImportId;
            radio.addEventListener('change', () => {
                selectedActiveImportId = radio.value;
                updateCancelImportState();
            });
            row.appendChild(radio);

            const content = document.createElement('div');
            content.className = 'job-content';

            const title = document.createElement('div');
            title.className = 'job-title';
            title.textContent = job.id ? String(job.id) : 'Unknown import job';
            content.appendChild(title);

            const namespace = job.namespace ? String(job.namespace) : '(default)';
            const uri = job.uri ? String(job.uri) : 'Unknown URI';
            const meta = document.createElement('div');
            meta.className = 'job-meta';
            meta.textContent = `${job.status || 'Unknown'} | Namespace: ${namespace} | Created: ${formatDate(job.created_at)}`;
            content.appendChild(meta);

            const detail = document.createElement('div');
            detail.className = 'job-detail';
            detail.textContent = `URI: ${uri} | Updated: ${formatDate(job.updated_at)}`;
            content.appendChild(detail);

            row.appendChild(content);
            activeImportsList.appendChild(row);
        });

        activeImportsEmpty.textContent = '';
        activeImportsEmpty.className = 'jobs-summary hidden';
        updateCancelImportState();
    }

    function setUpsertMode(hasIntegratedEmbeddings) {
        if (hasIntegratedEmbeddings) {
            if (upsertVectorSection) {
                upsertVectorSection.classList.add('hidden');
            }
            if (upsertRecordsSection) {
                upsertRecordsSection.classList.remove('hidden');
            }
            if (upsertModeHint) {
                upsertModeHint.textContent = 'Integrated embeddings index: use Upsert Records.';
            }
            return;
        }

        if (upsertVectorSection) {
            upsertVectorSection.classList.remove('hidden');
        }
        if (upsertRecordsSection) {
            upsertRecordsSection.classList.add('hidden');
        }
        if (upsertModeHint) {
            upsertModeHint.textContent = 'Standard index: use Upsert Vector.';
        }
    }

    function payloadFor(action) {
        switch (action) {
            case 'upsertVectors':
                return {
                    id: val('upsert-id'),
                    namespace: val('upsert-namespace'),
                    values: val('upsert-values'),
                    metadata: val('upsert-metadata')
                };
            case 'upsertRecords':
                return {
                    namespace: val('records-namespace'),
                    records: val('records-json')
                };
            case 'fetchVectors':
                return {
                    ids: val('fetch-ids'),
                    namespace: val('fetch-namespace')
                };
            case 'fetchByMetadata':
                return {
                    namespace: val('fetch-meta-namespace'),
                    limit: val('fetch-meta-limit'),
                    filter: val('fetch-meta-filter')
                };
            case 'updateVector':
                return {
                    id: val('update-id'),
                    namespace: val('update-namespace'),
                    values: val('update-values'),
                    setMetadata: val('update-set-metadata')
                };
            case 'updateByMetadata':
                return {
                    namespace: val('update-meta-namespace'),
                    filter: val('update-meta-filter'),
                    setMetadata: val('update-meta-set'),
                    dryRun: checked('update-meta-dryrun')
                };
            case 'deleteVectors':
                return {
                    namespace: val('delete-namespace'),
                    ids: val('delete-ids'),
                    filter: val('delete-filter'),
                    deleteAll: checked('delete-all')
                };
            case 'listVectorIds':
                return {
                    namespace: val('list-namespace'),
                    prefix: val('list-prefix'),
                    limit: val('list-limit'),
                    paginationToken: val('list-token')
                };
            case 'startImport':
                return {
                    uri: val('import-uri'),
                    integrationId: val('import-integration-id'),
                    namespace: val('import-namespace'),
                    mode: val('import-mode'),
                    errorMode: val('import-error-mode')
                };
            case 'refreshActiveImports':
                return {};
            case 'cancelImport':
                return {
                    importId: selectedActiveImportId
                };
            default:
                return {};
        }
    }

    function setSectionResult(action, value) {
        const id = actionResultIds[action];
        if (!id) {
            return;
        }
        const sectionResult = document.getElementById(id);
        if (!sectionResult) {
            return;
        }
        sectionResult.classList.remove('hidden');
        sectionResult.innerHTML = '';
        sectionResult.appendChild(renderResultBlock(action, value));
    }

    function renderResultBlock(action, value) {
        const wrapper = document.createElement('div');
        wrapper.className = 'results-section';
        const header = document.createElement('div');
        header.className = 'results-header';
        const title = document.createElement('div');
        title.className = 'results-title';
        title.textContent = `${friendlyActionName(action)} result`;
        header.appendChild(title);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'secondary-action';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => clearSectionResult(action));
        header.appendChild(clearBtn);
        wrapper.appendChild(header);

        const items = extractItemList(value);
        if (items.length > 0) {
            items.forEach((item, index) => {
                wrapper.appendChild(renderMatchItem(item, index));
            });
            return wrapper;
        }

        if (value === null || value === undefined || value === '') {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No data returned.';
            wrapper.appendChild(empty);
            return wrapper;
        }

        if (typeof value === 'object') {
            wrapper.appendChild(createTableForObject(value));
            return wrapper;
        }

        const primitive = document.createElement('div');
        primitive.textContent = String(value);
        wrapper.appendChild(primitive);
        return wrapper;
    }

    function extractItemList(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (!value || typeof value !== 'object') {
            return [];
        }
        if (Array.isArray(value.matches)) {
            return value.matches;
        }
        if (Array.isArray(value.vectors)) {
            return value.vectors;
        }
        if (value.vectors && typeof value.vectors === 'object') {
            return Object.entries(value.vectors).map(([id, vector]) => {
                const vectorObject = (vector && typeof vector === 'object') ? vector : {};
                return { id, ...vectorObject };
            });
        }
        if (Array.isArray(value.records)) {
            return value.records;
        }
        if (Array.isArray(value.results)) {
            return value.results;
        }
        if (Array.isArray(value.data)) {
            return value.data;
        }
        if (Array.isArray(value.ids)) {
            return value.ids.map(id => ({ id }));
        }
        return [];
    }

    function renderMatchItem(item, index) {
        const el = document.createElement('div');
        el.className = 'match-item';

        const header = document.createElement('div');
        header.className = 'match-header';
        const left = document.createElement('span');
        left.textContent = item && item.id ? `ID: ${item.id}` : `Item ${index + 1}`;
        header.appendChild(left);

        if (item && typeof item.score === 'number') {
            const right = document.createElement('span');
            right.textContent = `Score: ${item.score.toFixed(4)}`;
            header.appendChild(right);
        }
        el.appendChild(header);

        if (item && typeof item === 'object') {
            const details = { ...item };
            delete details.id;
            delete details.score;
            if (Object.keys(details).length > 0) {
                el.appendChild(createTableForObject(details));
            }
        } else {
            const text = document.createElement('div');
            text.textContent = String(item);
            el.appendChild(text);
        }

        return el;
    }

    function createTableForObject(value) {
        const table = document.createElement('table');
        table.className = 'metadata-table';
        const objectValue = value && typeof value === 'object' ? value : {};

        Object.entries(objectValue).forEach(([key, raw]) => {
            const row = document.createElement('tr');
            const keyCell = document.createElement('td');
            keyCell.className = 'metadata-key';
            keyCell.textContent = key;
            row.appendChild(keyCell);

            const valueCell = document.createElement('td');
            valueCell.className = 'metadata-value';
            valueCell.appendChild(renderValueNode(key, raw));
            row.appendChild(valueCell);

            table.appendChild(row);
        });
        return table;
    }

    function renderValueNode(key, value) {
        if (value === null || value === undefined) {
            const span = document.createElement('span');
            span.className = 'empty-result';
            span.textContent = 'null';
            return span;
        }

        if (typeof value === 'string') {
            const looksLikeLongText = key === 'text' || key === 'content' || key === 'chunk_text' || value.length > 180;
            if (looksLikeLongText) {
                const div = document.createElement('div');
                div.className = 'text-content';
                div.textContent = value;
                return div;
            }
            const span = document.createElement('span');
            span.textContent = value;
            return span;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            const span = document.createElement('span');
            span.textContent = String(value);
            return span;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                const span = document.createElement('span');
                span.className = 'empty-result';
                span.textContent = '[]';
                return span;
            }
            const allPrimitive = value.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item));
            if (allPrimitive) {
                const span = document.createElement('span');
                span.textContent = `[${value.map(item => String(item)).join(', ')}]`;
                return span;
            }
            const container = document.createElement('div');
            value.forEach((item, index) => {
                container.appendChild(renderMatchItem(item, index));
            });
            return container;
        }

        if (typeof value === 'object') {
            return createTableForObject(value);
        }

        const fallback = document.createElement('span');
        fallback.textContent = String(value);
        return fallback;
    }

    function friendlyActionName(action) {
        switch (action) {
            case 'upsertVectors':
                return 'Upsert Vector';
            case 'upsertRecords':
                return 'Upsert Records';
            case 'fetchVectors':
                return 'Fetch by IDs';
            case 'fetchByMetadata':
                return 'Fetch by Metadata';
            case 'updateVector':
                return 'Update Vector';
            case 'updateByMetadata':
                return 'Update by Metadata';
            case 'deleteVectors':
                return 'Delete Vectors';
            case 'listVectorIds':
                return 'List Vector IDs';
            case 'startImport':
                return 'Start Import';
            case 'cancelImport':
                return 'Cancel Import';
            default:
                return 'Operation';
        }
    }

    document.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            clearError();
            const action = btn.getAttribute('data-action');
            if (!action) {
                return;
            }
            if (importsDisabled && (action === 'startImport' || action === 'refreshActiveImports' || action === 'cancelImport')) {
                showError('Imports are not available on the Free plan.');
                return;
            }
            clearSectionResult(action);
            vscode.postMessage({
                command: action,
                payload: payloadFor(action)
            });
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'setIndex':
                indexNameSpan.textContent = message.indexName;
                setUpsertMode(!!message.hasIntegratedEmbeddings);
                importsDisabled = !!message.importsDisabled;
                if (importsSection) {
                    importsSection.classList.toggle('hidden', importsDisabled);
                }
                break;
            case 'activeImports':
                renderActiveImports(message.imports || []);
                break;
            case 'result':
                setSectionResult(message.action, message.result);
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
    updateCancelImportState();
})();
