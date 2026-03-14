(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const assistantNameEl = document.getElementById('assistant-name');
    const modeTitleEl = document.getElementById('mode-title');
    const errorDiv = document.getElementById('error');
    const sections = Array.from(document.querySelectorAll('[data-mode]'));

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

    function renderSnippet(snippet, index) {
        const item = document.createElement('div');
        item.className = 'match-item';
        const header = document.createElement('div');
        header.className = 'match-header';
        const rawTitle = snippet?.file?.name || snippet?.file_name || `Snippet ${index + 1}`;
        const rawScore = typeof snippet?.score === 'number' ? snippet.score.toFixed(4) : undefined;
        const title = document.createElement('span');
        title.textContent = rawTitle;
        header.appendChild(title);
        if (rawScore) {
            const score = document.createElement('span');
            score.textContent = `Score: ${rawScore}`;
            header.appendChild(score);
        }
        item.appendChild(header);

        const text = snippet?.text || snippet?.chunk_text || snippet?.content;
        if (typeof text === 'string' && text.trim()) {
            const content = document.createElement('div');
            content.className = 'text-content';
            content.textContent = text;
            item.appendChild(content);
        }

        const details = { ...snippet };
        delete details.text;
        delete details.chunk_text;
        delete details.content;
        delete details.score;
        if (Object.keys(details).length > 0) {
            item.appendChild(createTableForObject(details));
        }

        return item;
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

        if (typeof value === 'string') {
            const longText = key === 'text' || key === 'content' || key === 'answer' || value.length > 160;
            if (longText) {
                const block = document.createElement('div');
                block.className = 'text-content';
                block.textContent = value;
                return block;
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
