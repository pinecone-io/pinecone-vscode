(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const errorDiv = document.getElementById('error');
    const embedModelSelect = document.getElementById('embed-model');
    const embedInputTypeSelect = document.getElementById('embed-input-type');
    const rerankModelSelect = document.getElementById('rerank-model');
    const rerankDocumentsList = document.getElementById('rerank-documents-list');
    const addRerankDocumentBtn = document.getElementById('add-rerank-document');
    const embedResultSection = document.getElementById('embed-result-section');
    const embedResultsList = document.getElementById('embed-results-list');
    const rerankResultSection = document.getElementById('rerank-result-section');
    const rerankResultsList = document.getElementById('rerank-results-list');
    const clearEmbedResultsBtn = document.getElementById('clear-embed-results');
    const clearRerankResultsBtn = document.getElementById('clear-rerank-results');
    const clearRerankDocumentsBtn = document.getElementById('clear-rerank-documents');
    const MAX_TEXT_PREVIEW_LENGTH = 300;

    function value(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function hideSectionResult(section, list) {
        if (list) {
            list.innerHTML = '';
        }
        if (section) {
            section.classList.add('hidden');
        }
    }

    function setModelOptions(selectEl, models, label) {
        if (!selectEl) {
            return;
        }
        selectEl.innerHTML = '';
        if (!models || models.length === 0) {
            selectEl.innerHTML = `<option value="">No ${label} models available</option>`;
            return;
        }
        selectEl.appendChild(new Option(`Select ${label} model`, ''));
        models.forEach(model => selectEl.appendChild(new Option(model, model)));
    }

    function isSparseEmbedModelName(modelName) {
        return String(modelName || '').toLowerCase().includes('sparse');
    }

    function setEmbedInputTypeOptionsForModel(modelName) {
        if (!embedInputTypeSelect) {
            return;
        }

        const sparseModel = isSparseEmbedModelName(modelName);
        const previous = embedInputTypeSelect.value;
        embedInputTypeSelect.innerHTML = '';

        if (sparseModel) {
            embedInputTypeSelect.appendChild(new Option('passage (required for sparse models)', 'passage'));
            embedInputTypeSelect.value = 'passage';
            embedInputTypeSelect.disabled = true;
            return;
        }

        embedInputTypeSelect.appendChild(new Option('Auto', ''));
        embedInputTypeSelect.appendChild(new Option('query', 'query'));
        embedInputTypeSelect.appendChild(new Option('passage', 'passage'));
        embedInputTypeSelect.value = previous === 'query' || previous === 'passage' ? previous : '';
        embedInputTypeSelect.disabled = false;
    }

    function payloadFor(action) {
        switch (action) {
            case 'embed':
                return {
                    model: value('embed-model'),
                    inputType: value('embed-input-type'),
                    inputs: value('embed-inputs')
                };
            case 'rerank':
                return {
                    model: value('rerank-model'),
                    query: value('rerank-query'),
                    documents: collectRerankDocuments(),
                    topN: value('rerank-topn')
                };
            default:
                return {};
        }
    }

    function addRerankDocument(initialValue) {
        if (!rerankDocumentsList) {
            return;
        }
        const item = document.createElement('div');
        item.className = 'rerank-document';

        const header = document.createElement('div');
        header.className = 'rerank-document-header';

        const title = document.createElement('span');
        title.className = 'rerank-document-title';
        title.textContent = 'Document';
        header.appendChild(title);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'secondary-action rerank-toggle';
        toggleBtn.textContent = 'Collapse';
        toggleBtn.addEventListener('click', () => {
            item.classList.toggle('collapsed');
            toggleBtn.textContent = item.classList.contains('collapsed') ? 'Expand' : 'Collapse';
        });
        header.appendChild(toggleBtn);

        const textarea = document.createElement('textarea');
        textarea.rows = 6;
        textarea.placeholder = 'Paste one full document here';
        textarea.value = initialValue || '';
        const body = document.createElement('div');
        body.className = 'rerank-document-body';
        body.appendChild(textarea);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'secondary-action';
        removeBtn.textContent = 'Delete Document';
        removeBtn.addEventListener('click', () => {
            if (rerankDocumentsList.children.length <= 1) {
                textarea.value = '';
                return;
            }
            item.remove();
            refreshRerankDocumentHeaders();
        });
        header.appendChild(removeBtn);

        item.appendChild(header);
        item.appendChild(body);
        rerankDocumentsList.appendChild(item);
        refreshRerankDocumentHeaders();
    }

    function collectRerankDocuments() {
        if (!rerankDocumentsList) {
            return [];
        }
        return Array.from(rerankDocumentsList.querySelectorAll('textarea'))
            .map(el => el.value.trim())
            .filter(Boolean);
    }

    function refreshRerankDocumentHeaders() {
        if (!rerankDocumentsList) {
            return;
        }
        Array.from(rerankDocumentsList.querySelectorAll('.rerank-document')).forEach((item, index) => {
            const title = item.querySelector('.rerank-document-title');
            if (title) {
                title.textContent = `Document ${index + 1}`;
            }
            const toggleBtn = item.querySelector('.rerank-toggle');
            if (toggleBtn) {
                toggleBtn.textContent = item.classList.contains('collapsed') ? 'Expand' : 'Collapse';
            }
        });
    }

    function clearRerankDocuments() {
        if (!rerankDocumentsList) {
            return;
        }
        rerankDocumentsList.innerHTML = '';
        addRerankDocument('');
    }

    function renderEmbedResults(result, meta) {
        if (!embedResultSection || !embedResultsList) {
            return;
        }
        embedResultsList.innerHTML = '';
        const vectors = Array.isArray(result && result.data) ? result.data : [];
        const inputTexts = Array.isArray(meta && meta.inputTexts) ? meta.inputTexts : [];
        if (vectors.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No embeddings returned.';
            embedResultsList.appendChild(empty);
            embedResultSection.classList.remove('hidden');
            return;
        }

        vectors.forEach((item, index) => {
            const values = Array.isArray(item?.values) ? item.values : [];
            const sparseValues = item?.sparse_values && typeof item.sparse_values === 'object'
                ? item.sparse_values
                : undefined;
            const itemIndex = typeof item?.index === 'number' ? item.index : index;
            const embeddingItem = {
                id: `embedding-${itemIndex}`,
                input_text: inputTexts[itemIndex] || inputTexts[index] || undefined,
                index: itemIndex,
                dimension: values.length > 0 ? values.length : undefined,
                sparse_terms: sparseValues && Array.isArray(sparseValues.indices) ? sparseValues.indices.length : undefined,
                values: values.length > 0 ? values : undefined,
                sparse_values: sparseValues
            };
            embedResultsList.appendChild(renderMatchItem(embeddingItem, index));
        });

        embedResultSection.classList.remove('hidden');
    }

    function renderRerankResults(result, meta) {
        if (!rerankResultSection || !rerankResultsList) {
            return;
        }
        rerankResultsList.innerHTML = '';

        const rows = Array.isArray(result?.data)
            ? result.data
            : (Array.isArray(result?.results) ? result.results : []);

        if (meta && Number(meta.truncatedDocuments) > 0) {
            const note = document.createElement('div');
            note.className = 'results-note';
            note.textContent = `${Number(meta.truncatedDocuments)} document(s) were truncated to fit the model token limit (${meta.tokenLimit || 1024}).`;
            rerankResultsList.appendChild(note);
        }

        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-result';
            empty.textContent = 'No rerank results returned.';
            rerankResultsList.appendChild(empty);
            rerankResultSection.classList.remove('hidden');
            return;
        }

        rows.forEach((row, index) => {
            const card = document.createElement('div');
            card.className = 'match-item';

            const header = document.createElement('div');
            header.className = 'match-header';
            const rank = document.createElement('span');
            rank.textContent = `Rank ${index + 1}`;
            header.appendChild(rank);
            if (typeof row?.score === 'number') {
                const score = document.createElement('span');
                score.textContent = `Score: ${row.score.toFixed(4)}`;
                header.appendChild(score);
            }
            card.appendChild(header);

            const documentValue = row?.document;
            if (typeof documentValue === 'string') {
                card.appendChild(renderTextContent(documentValue));
            } else if (documentValue && typeof documentValue === 'object') {
                const normalizedDocument = { ...documentValue };
                const textValue = normalizedDocument.text || normalizedDocument.content || normalizedDocument.chunk_text;
                if (typeof textValue === 'string') {
                    card.appendChild(renderTextContent(textValue));
                }
                delete normalizedDocument.text;
                delete normalizedDocument.content;
                delete normalizedDocument.chunk_text;
                if (Object.keys(normalizedDocument).length > 0) {
                    card.appendChild(createTableForObject(normalizedDocument));
                }
            }

            if (typeof row?.index === 'number') {
                const footer = document.createElement('div');
                footer.className = 'result-footer';
                footer.textContent = `Original document index: ${row.index}`;
                card.appendChild(footer);
            }

            rerankResultsList.appendChild(card);
        });

        rerankResultSection.classList.remove('hidden');
    }

    function renderTextContent(fullText) {
        const text = String(fullText || '').replace(/^\s+/, '');
        const isExpandable = text.length > MAX_TEXT_PREVIEW_LENGTH;
        const collapsedText = isExpandable ? `${text.substring(0, MAX_TEXT_PREVIEW_LENGTH)}...` : text;

        const container = document.createElement('div');
        container.className = `text-content ${isExpandable ? 'expandable' : ''}`;
        container.dataset.full = text;
        container.dataset.collapsed = collapsedText;
        container.dataset.expanded = 'false';

        const actions = document.createElement('div');
        actions.className = 'text-content-actions';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'text-action-btn secondary-action';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                // Best effort only in webview sandbox.
            }
        });
        actions.appendChild(copyButton);

        if (isExpandable) {
            const toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.className = 'text-action-btn secondary-action';
            toggleButton.textContent = 'Show more';
            toggleButton.addEventListener('click', () => {
                const expanded = container.dataset.expanded === 'true';
                body.textContent = expanded ? collapsedText : text;
                toggleButton.textContent = expanded ? 'Show more' : 'Show less';
                container.dataset.expanded = expanded ? 'false' : 'true';
            });
            actions.appendChild(toggleButton);
        }

        const body = document.createElement('div');
        body.className = 'text-content-body';
        body.textContent = collapsedText;

        container.appendChild(actions);
        container.appendChild(body);
        return container;
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
                return renderTextContent(value);
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

    document.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (!action) {
                return;
            }
            clearError();
            if (action === 'embed') {
                hideSectionResult(embedResultSection, embedResultsList);
            } else if (action === 'rerank') {
                hideSectionResult(rerankResultSection, rerankResultsList);
            }
            vscode.postMessage({
                command: action,
                payload: payloadFor(action)
            });
        });
    });

    if (addRerankDocumentBtn) {
        addRerankDocumentBtn.addEventListener('click', () => addRerankDocument(''));
    }

    if (clearRerankDocumentsBtn) {
        clearRerankDocumentsBtn.addEventListener('click', () => clearRerankDocuments());
    }

    if (clearEmbedResultsBtn) {
        clearEmbedResultsBtn.addEventListener('click', () => hideSectionResult(embedResultSection, embedResultsList));
    }

    if (clearRerankResultsBtn) {
        clearRerankResultsBtn.addEventListener('click', () => hideSectionResult(rerankResultSection, rerankResultsList));
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'models':
                setModelOptions(embedModelSelect, message.embedModels || [], 'embed');
                setModelOptions(rerankModelSelect, message.rerankModels || [], 'rerank');
                setEmbedInputTypeOptionsForModel(embedModelSelect ? embedModelSelect.value : '');
                break;
            case 'result':
                if (message.action === 'embed') {
                    renderEmbedResults(message.result || {}, message.meta || {});
                } else if (message.action === 'rerank') {
                    renderRerankResults(message.result || {}, message.meta || {});
                }
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
    if (embedModelSelect) {
        embedModelSelect.addEventListener('change', () => {
            setEmbedInputTypeOptionsForModel(embedModelSelect.value);
        });
    }
    setEmbedInputTypeOptionsForModel(embedModelSelect ? embedModelSelect.value : '');
    clearRerankDocuments();
})();
