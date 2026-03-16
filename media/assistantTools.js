(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const assistantNameEl = document.getElementById('assistant-name');
    const modeTitleEl = document.getElementById('mode-title');
    const errorDiv = document.getElementById('error');
    const sections = Array.from(document.querySelectorAll('[data-mode]'));
    const MAX_TEXT_PREVIEW_LENGTH = 300;

    let nextCopyRequestId = 1;

    const actionResultIds = {
        updateAssistant: 'result-updateAssistant',
        retrieveContext: 'result-retrieveContext',
        evaluateAnswer: 'result-evaluateAnswer'
    };

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

    function setSectionResult(action, result) {
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
        sectionResult.appendChild(renderResult(action, result));
    }

    function renderResult(action, result) {
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

        if (action === 'retrieveContext') {
            const snippets = normalizeSnippets(result);
            if (snippets.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'empty-result';
                empty.textContent = 'No context snippets returned.';
                wrapper.appendChild(empty);
                return wrapper;
            }
            snippets.forEach((snippet, index) => {
                wrapper.appendChild(renderSnippet(snippet, index));
            });
            return wrapper;
        }

        if (action === 'evaluateAnswer') {
            const evalItem = document.createElement('div');
            evalItem.className = 'match-item';
            evalItem.appendChild(createTableForObject(result || {}));
            wrapper.appendChild(evalItem);
            return wrapper;
        }

        if (result && typeof result === 'object') {
            const item = document.createElement('div');
            item.className = 'match-item';
            item.appendChild(createTableForObject(result));
            wrapper.appendChild(item);
            return wrapper;
        }

        const primitive = document.createElement('div');
        primitive.textContent = String(result ?? '');
        wrapper.appendChild(primitive);
        return wrapper;
    }

    function normalizeSnippets(result) {
        if (!result || typeof result !== 'object') {
            return [];
        }
        if (Array.isArray(result.context)) {
            return result.context;
        }
        if (Array.isArray(result.snippets)) {
            return result.snippets;
        }
        if (Array.isArray(result.matches)) {
            return result.matches;
        }
        return [];
    }

    function resolveSnippetReference(snippet, index) {
        const sourceFile = firstString([
            snippet && snippet.source_file,
            snippet && snippet.file_name,
            snippet && snippet.file && snippet.file.name
        ]);
        const signedUrl = firstString([
            snippet && snippet.signed_url,
            snippet && snippet.file && snippet.file.signed_url,
            snippet && snippet.file && snippet.file.url
        ]);

        if (!sourceFile && !signedUrl) {
            return {
                label: `Snippet ${index + 1}`,
                url: undefined
            };
        }

        return {
            label: sourceFile || `Snippet ${index + 1}`,
            url: signedUrl
        };
    }

    function firstString(values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }
        return undefined;
    }

    function resolveReferenceFromObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }

        const fileName = firstString([
            value.source_file,
            value.file_name,
            value.name,
            value.file && value.file.name
        ]);
        const signedUrl = firstString([
            value.signed_url,
            value.url,
            value.file && value.file.signed_url,
            value.file && value.file.url
        ]);

        if (!fileName && !signedUrl) {
            return undefined;
        }

        return {
            label: fileName || 'Download',
            url: signedUrl
        };
    }

    function renderSnippet(snippet, index) {
        const item = document.createElement('div');
        item.className = 'match-item';

        const header = document.createElement('div');
        header.className = 'match-header';

        const title = document.createElement('span');
        title.textContent = `Snippet ${index + 1}`;
        header.appendChild(title);

        if (typeof snippet?.score === 'number') {
            const score = document.createElement('span');
            score.textContent = `Score: ${snippet.score.toFixed(4)}`;
            header.appendChild(score);
        }
        item.appendChild(header);

        const reference = resolveSnippetReference(snippet, index);
        if (reference) {
            const referenceRow = document.createElement('div');
            referenceRow.className = 'snippet-reference';

            const label = document.createElement('span');
            label.className = 'snippet-reference-label';
            label.textContent = 'Reference: ';
            referenceRow.appendChild(label);

            if (reference.url) {
                const link = document.createElement('a');
                link.className = 'metadata-link';
                link.href = reference.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = reference.label;
                referenceRow.appendChild(link);
            } else {
                const text = document.createElement('span');
                text.textContent = reference.label;
                referenceRow.appendChild(text);
            }

            item.appendChild(referenceRow);
        }

        const text = snippet?.text || snippet?.chunk_text || snippet?.content;
        if (typeof text === 'string' && text.trim()) {
            item.appendChild(renderTextContent(text));
        }

        const details = { ...snippet };
        delete details.text;
        delete details.chunk_text;
        delete details.content;
        delete details.score;
        delete details.source_file;
        delete details.file_name;
        delete details.signed_url;
        delete details.file;

        if (Object.keys(details).length > 0) {
            item.appendChild(createTableForObject(details));
        }

        return item;
    }

    function renderTextContent(fullText) {
        const normalizedText = String(fullText || '').replace(/^\s+/, '');
        const isExpandable = normalizedText.length > MAX_TEXT_PREVIEW_LENGTH;
        const collapsedText = isExpandable
            ? `${normalizedText.substring(0, MAX_TEXT_PREVIEW_LENGTH)}...`
            : normalizedText;

        const container = document.createElement('div');
        container.className = `text-content ${isExpandable ? 'expandable' : ''}`;
        container.dataset.full = normalizedText;
        container.dataset.collapsed = collapsedText;
        container.dataset.expanded = 'false';

        const actions = document.createElement('div');
        actions.className = 'text-content-actions';

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'text-action-btn copy-btn';
        copyButton.textContent = 'Copy';
        copyButton.setAttribute('data-text-action', 'copy');
        actions.appendChild(copyButton);

        if (isExpandable) {
            const toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.className = 'text-action-btn expand-btn';
            toggleButton.textContent = 'Show more';
            toggleButton.setAttribute('data-text-action', 'toggle');
            actions.appendChild(toggleButton);
        }

        const body = document.createElement('div');
        body.className = 'text-content-body';
        body.textContent = isExpandable ? collapsedText : normalizedText;

        container.appendChild(actions);
        container.appendChild(body);
        return container;
    }

    function toggleTextContent(container) {
        const isExpanded = container.dataset.expanded === 'true';
        const fullText = container.dataset.full || '';
        const collapsedText = container.dataset.collapsed || fullText;
        const body = container.querySelector('.text-content-body');
        const toggleButton = container.querySelector('button[data-text-action="toggle"]');

        if (body) {
            body.textContent = isExpanded ? collapsedText : fullText;
        }
        if (toggleButton) {
            toggleButton.textContent = isExpanded ? 'Show more' : 'Show less';
        }
        container.dataset.expanded = isExpanded ? 'false' : 'true';
    }

    function requestCopy(fullText, button) {
        const copyId = `copy-${nextCopyRequestId++}`;
        button.dataset.copyId = copyId;
        button.disabled = true;
        button.textContent = 'Copying...';
        vscode.postMessage({
            command: 'copyToClipboard',
            text: fullText,
            copyId
        });
    }

    function markCopied(copyId) {
        const selector = `button[data-copy-id="${copyId}"]`;
        const button = document.querySelector(selector);
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        button.disabled = false;
        button.textContent = 'Copied';
        setTimeout(() => {
            button.textContent = 'Copy';
            button.removeAttribute('data-copy-id');
        }, 1200);
    }

    function markCopyFailed(copyId, message) {
        const selector = `button[data-copy-id="${copyId}"]`;
        const button = document.querySelector(selector);
        if (button instanceof HTMLButtonElement) {
            button.disabled = false;
            button.textContent = 'Copy';
            button.removeAttribute('data-copy-id');
        }
        if (message) {
            showError(message);
        }
    }

    function createTableForObject(obj) {
        const table = document.createElement('table');
        table.className = 'metadata-table';
        const value = (obj && typeof obj === 'object') ? obj : {};

        Object.entries(value).forEach(([key, raw]) => {
            const row = document.createElement('tr');

            const keyCell = document.createElement('td');
            keyCell.className = 'metadata-key';
            keyCell.textContent = key;
            row.appendChild(keyCell);

            const valueCell = document.createElement('td');
            valueCell.className = 'metadata-value';
            valueCell.appendChild(renderValue(key, raw));
            row.appendChild(valueCell);

            table.appendChild(row);
        });

        if (Object.keys(value).length === 0) {
            const row = document.createElement('tr');
            const keyCell = document.createElement('td');
            keyCell.className = 'metadata-key';
            keyCell.textContent = 'status';
            const valueCell = document.createElement('td');
            valueCell.className = 'metadata-value';
            valueCell.textContent = 'Success';
            row.appendChild(keyCell);
            row.appendChild(valueCell);
            table.appendChild(row);
        }

        return table;
    }

    function renderValue(key, value) {
        if (value === null || value === undefined) {
            const span = document.createElement('span');
            span.className = 'empty-result';
            span.textContent = 'null';
            return span;
        }

        const normalizedKey = String(key || '').toLowerCase();

        if (normalizedKey === 'reference') {
            const resolved = resolveReferenceFromObject(value);
            if (resolved) {
                if (resolved.url) {
                    const link = document.createElement('a');
                    link.className = 'metadata-link';
                    link.href = resolved.url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = resolved.label;
                    return link;
                }
                const span = document.createElement('span');
                span.textContent = resolved.label;
                return span;
            }
        }

        if (typeof value === 'string') {
            const longText = key === 'text' || key === 'content' || key === 'answer' || value.length > 160;
            if (longText) {
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
            const pre = document.createElement('pre');
            pre.className = 'code-block';
            pre.textContent = JSON.stringify(value, null, 2);
            return pre;
        }

        if (typeof value === 'object') {
            const pre = document.createElement('pre');
            pre.className = 'code-block';
            pre.textContent = JSON.stringify(value, null, 2);
            return pre;
        }

        const span = document.createElement('span');
        span.textContent = String(value);
        return span;
    }

    function payloadFor(action) {
        switch (action) {
            case 'updateAssistant':
                return {
                    instructions: value('instructions'),
                    metadata: value('assistant-metadata')
                };
            case 'retrieveContext':
                return {
                    query: value('context-query'),
                    topK: value('context-topk'),
                    filter: value('context-filter')
                };
            case 'evaluateAnswer':
                return {
                    question: value('eval-question'),
                    answer: value('eval-answer'),
                    groundTruth: value('eval-ground-truth')
                };
            default:
                return {};
        }
    }

    function setUpdateDefaults(instructions, metadata) {
        const instructionsEl = document.getElementById('instructions');
        const metadataEl = document.getElementById('assistant-metadata');
        if (instructionsEl) {
            instructionsEl.value = instructions || '';
        }
        if (metadataEl) {
            metadataEl.value = metadata || '';
        }
    }

    function setMode(mode) {
        const titleByMode = {
            update: 'Update Assistant',
            context: 'Retrieve Context',
            evaluate: 'Evaluate Answer'
        };

        sections.forEach(section => {
            if (section.dataset.mode === mode) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });

        if (modeTitleEl) {
            modeTitleEl.textContent = titleByMode[mode] || 'Assistant Tools';
        }
    }

    function friendlyActionName(action) {
        switch (action) {
            case 'updateAssistant':
                return 'Update Assistant';
            case 'retrieveContext':
                return 'Retrieve Context';
            case 'evaluateAnswer':
                return 'Evaluate Answer';
            default:
                return 'Operation';
        }
    }

    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const actionButton = target.closest('button[data-text-action]');
        if (!(actionButton instanceof HTMLButtonElement)) {
            return;
        }

        const container = actionButton.closest('.text-content[data-full]');
        if (!(container instanceof HTMLElement)) {
            return;
        }

        const action = actionButton.getAttribute('data-text-action');
        if (action === 'toggle') {
            toggleTextContent(container);
            return;
        }

        if (action === 'copy') {
            requestCopy(container.dataset.full || '', actionButton);
        }
    });

    document.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (!action) {
                return;
            }
            clearError();
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
            case 'setAssistant':
                assistantNameEl.textContent = message.assistantName || 'Assistant';
                setMode(message.mode || 'update');
                break;
            case 'result':
                setSectionResult(message.action, message.result);
                break;
            case 'updateDefaults':
                setUpdateDefaults(message.instructions, message.metadata);
                break;
            case 'copied':
                markCopied(message.copyId);
                break;
            case 'copyError':
                markCopyFailed(message.copyId, message.message);
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
