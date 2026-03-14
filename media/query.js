/**
 * Query Panel Client Script
 * 
 * Handles user interactions in the query webview panel.
 * Supports two modes:
 * - Text search: For indexes with integrated embeddings
 * - Vector search: For standard indexes
 * 
 * Communicates with the extension via VSCode webview API.
 */
(function() {
    // @ts-ignore - acquireVsCodeApi is provided by VSCode
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const queryBtn = document.getElementById('query-btn');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const resultsDiv = document.getElementById('results');
    const matchesList = document.getElementById('matches-list');
    const clearResultsBtn = document.getElementById('clear-results-btn');
    const textSearchSection = document.getElementById('text-search-section');
    const vectorSearchSection = document.getElementById('vector-search-section');
    const embedInfo = document.getElementById('embed-info');
    const metadataOption = document.getElementById('metadata-option');
    const searchAdvancedSection = document.getElementById('search-advanced-section');
    const MAX_TEXT_PREVIEW_LENGTH = 300;

    // Track whether index has integrated embeddings
    let hasIntegratedEmbeddings = false;
    let nextCopyRequestId = 1;

    // Notify extension that webview is ready
    vscode.postMessage({ command: 'ready' });

    /**
     * Configures the UI based on whether the index has integrated embeddings.
     * @param {boolean} hasEmbeddings - True if index uses integrated embeddings
     * @param {string} [model] - Name of the embedding model (if applicable)
     */
    function configureMode(hasEmbeddings, model) {
        hasIntegratedEmbeddings = hasEmbeddings;
        
        if (hasEmbeddings) {
            // Show text search, hide vector search
            textSearchSection.classList.remove('hidden');
            vectorSearchSection.classList.add('hidden');
            embedInfo.classList.remove('hidden');
            embedInfo.textContent = `Using integrated embeddings (${model || 'model'})`;
            // Hide metadata option for integrated embeddings (fields are always returned)
            metadataOption.classList.add('hidden');
            searchAdvancedSection.classList.remove('hidden');
        } else {
            // Show vector search, hide text search
            textSearchSection.classList.add('hidden');
            vectorSearchSection.classList.remove('hidden');
            embedInfo.classList.add('hidden');
            metadataOption.classList.remove('hidden');
            searchAdvancedSection.classList.add('hidden');
        }
    }

    /**
     * Executes a query with the current form values.
     */
    queryBtn.addEventListener('click', () => {
        const namespace = document.getElementById('namespace-input').value;
        const topK = document.getElementById('top-k-input').value;
        const filterStr = document.getElementById('filter-input').value;
        const includeValues = document.getElementById('include-values').checked;
        const includeMetadata = document.getElementById('include-metadata').checked;
        const fieldsStr = document.getElementById('fields-input').value;

        // Build params based on search mode
        let params = {
            namespace,
            topK,
            filterStr,
            includeValues,
            includeMetadata,
            fieldsStr
        };

        if (hasIntegratedEmbeddings) {
            // Text-based search
            const textQuery = document.getElementById('text-input').value;
            if (!textQuery.trim()) {
                showError('Please enter a search query.');
                return;
            }
            params.textQuery = textQuery;
        } else {
            // Vector-based search
            const vectorStr = document.getElementById('vector-input').value;
            const id = document.getElementById('id-input').value;
            
            if (!vectorStr && !id) {
                showError('Please provide either a Vector or an ID.');
                return;
            }
            params.vectorStr = vectorStr;
            params.id = id;
        }

        // Update UI state
        loadingDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
        resultsDiv.classList.add('hidden');
        matchesList.innerHTML = '';
        if (clearResultsBtn) {
            clearResultsBtn.classList.add('hidden');
        }
        queryBtn.disabled = true;

        // Send query to extension
        vscode.postMessage({
            command: 'query',
            params: params
        });
    });

    errorDiv.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (target.classList.contains('login-btn')) {
            requestLogin();
        }
    });

    matchesList.addEventListener('click', event => {
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

    if (clearResultsBtn) {
        clearResultsBtn.addEventListener('click', () => {
            clearResults();
        });
    }

    /**
     * Handles messages from the extension.
     */
    window.addEventListener('message', event => {
        const message = event.data;
        
        // Handle initialization messages without hiding loading
        if (message.command === 'init' || message.command === 'setIndex') {
            if (message.command === 'init') {
                configureMode(message.hasIntegratedEmbeddings, message.embedModel);
            } else {
                document.getElementById('index-name').textContent = message.name;
                configureMode(message.hasIntegratedEmbeddings, message.embedModel);
            }
            return;
        }
        
        loadingDiv.classList.add('hidden');
        queryBtn.disabled = false;

        switch (message.command) {
            case 'result':
                showResults(message.data);
                break;
            case 'error':
                handleError(message.message);
                break;
            case 'authExpired':
                showAuthExpired();
                break;
            case 'copied':
                markCopied(message.copyId);
                break;
            case 'copyError':
                markCopyFailed(message.copyId, message.message);
                break;
        }
    });

    /**
     * Handles error messages with special handling for auth errors.
     * @param {string} errorMessage - The error message
     */
    function handleError(errorMessage) {
        const lowerMessage = errorMessage.toLowerCase();
        
        // Check for authentication-related errors
        if (lowerMessage.includes('401') || 
            lowerMessage.includes('unauthorized') || 
            lowerMessage.includes('token expired') ||
            lowerMessage.includes('authentication')) {
            showAuthExpired();
        } else {
            showError(errorMessage);
        }
    }

    /**
     * Shows a standard error message.
     * @param {string} msg - Error message to display
     */
    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.classList.remove('hidden');
        errorDiv.className = 'error';
    }

    /**
     * Shows authentication expired message with login action.
     */
    function showAuthExpired() {
        queryBtn.disabled = true;
        errorDiv.innerHTML = `
            <div class="auth-expired">
                <strong>Session Expired</strong>
                <p>Your authentication has expired. Please log in again to continue.</p>
                <button class="login-btn" type="button">Login</button>
            </div>
        `;
        errorDiv.classList.remove('hidden');
    }

    /**
     * Requests the extension to initiate login.
     */
    function requestLogin() {
        vscode.postMessage({ command: 'requestLogin' });
    }
    window.requestLogin = requestLogin;

    /**
     * Displays query results.
     * @param {Object} data - Query response data with matches array
     */
    function showResults(data) {
        resultsDiv.classList.remove('hidden');
        if (!data.matches || data.matches.length === 0) {
            matchesList.innerHTML = '<p>No matches found.</p>';
            if (clearResultsBtn) {
                clearResultsBtn.classList.add('hidden');
            }
            return;
        }

        if (clearResultsBtn) {
            clearResultsBtn.classList.remove('hidden');
        }

        data.matches.forEach(match => {
            const el = document.createElement('div');
            el.className = 'match-item';
            
            let content = `
                <div class="match-header">
                    <span class="match-id">ID: ${escapeHtml(match.id)}</span>
                    <span class="match-score">Score: ${match.score.toFixed(4)}</span>
                </div>
            `;
            
            if (match.metadata && Object.keys(match.metadata).length > 0) {
                content += formatMetadata(match.metadata);
            }

            if (match.values) {
                const valuesPreview = match.values.slice(0, 5).join(', ');
                const suffix = match.values.length > 5 ? ', ...' : '';
                content += `<div class="match-values">Values: [${escapeHtml(valuesPreview)}${suffix}]</div>`;
            }

            el.innerHTML = content;
            matchesList.appendChild(el);
        });
    }

    /**
     * Formats metadata/fields into a readable table.
     * Handles special cases like long text fields and URLs.
     * @param {Object} metadata - Metadata object to format
     * @returns {string} HTML string for formatted metadata
     */
    function formatMetadata(metadata) {
        let html = '<div class="match-metadata"><table class="metadata-table">';
        
        for (const [key, value] of Object.entries(metadata)) {
            const formattedValue = formatValue(key, value);
            html += `
                <tr>
                    <td class="metadata-key">${escapeHtml(key)}</td>
                    <td class="metadata-value">${formattedValue}</td>
                </tr>
            `;
        }
        
        html += '</table></div>';
        return html;
    }

    /**
     * Formats a single metadata value based on its type and key name.
     * @param {string} key - The metadata key
     * @param {*} value - The value to format
     * @returns {string} Formatted HTML string
     */
    function formatValue(key, value) {
        // Handle null/undefined
        if (value === null || value === undefined) {
            return '<span class="null-value">null</span>';
        }

        // Handle URLs - make them clickable
        if (typeof value === 'string' && (key.includes('url') || key.includes('link') || value.startsWith('http'))) {
            return `<a href="${escapeHtml(value)}" class="metadata-link" title="${escapeHtml(value)}">${escapeHtml(truncateText(value, 60))}</a>`;
        }

        // Handle long text fields (like 'text', 'content', 'chunk')
        if (typeof value === 'string' && (key === 'text' || key === 'content' || key === 'chunk' || value.length > 200)) {
            return renderTextContent(value);
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return `<span class="array-value">[${value.map(v => escapeHtml(String(v))).join(', ')}]</span>`;
        }

        // Handle objects
        if (typeof value === 'object') {
            return `<pre class="object-value">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }

        // Handle other types (numbers, booleans, strings)
        return escapeHtml(String(value));
    }

    /**
     * Truncates text to a maximum length, adding ellipsis if needed.
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function renderTextContent(fullText) {
        const normalizedText = String(fullText || '').replace(/^\s+/, '');
        const isExpandable = normalizedText.length > MAX_TEXT_PREVIEW_LENGTH;
        const collapsedText = truncateText(normalizedText, MAX_TEXT_PREVIEW_LENGTH);

        return `
            <div class="text-content ${isExpandable ? 'expandable' : ''}" data-full="${escapeAttr(normalizedText)}" data-collapsed="${escapeAttr(collapsedText)}" data-expanded="false">
                <div class="text-content-actions">
                    <button class="text-action-btn copy-btn" data-text-action="copy" type="button">Copy</button>
                    ${isExpandable ? '<button class="text-action-btn expand-btn" data-text-action="toggle" type="button">Show more</button>' : ''}
                </div>
                <div class="text-content-body">${escapeHtml(isExpandable ? collapsedText : normalizedText)}</div>
            </div>
        `;
    }

    function clearResults() {
        matchesList.innerHTML = '';
        resultsDiv.classList.add('hidden');
        if (clearResultsBtn) {
            clearResultsBtn.classList.add('hidden');
        }
    }

    /**
     * Escapes string for use in HTML attributes.
     * @param {string} text - Text to escape
     * @returns {string} Escaped text safe for attributes
     */
    function escapeAttr(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function toggleTextContent(container) {
        const isExpanded = container.dataset.expanded === 'true';
        const fullText = container.dataset.full || '';
        const collapsedText = container.dataset.collapsed || truncateText(fullText, MAX_TEXT_PREVIEW_LENGTH);
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

    /**
     * Escapes HTML special characters to prevent XSS.
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();
