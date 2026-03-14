/**
 * Chat Panel Client Script
 * 
 * Handles user interactions in the chat webview panel.
 * Communicates with the extension via VSCode webview API.
 * Supports both regular and streaming chat modes.
 */
(function() {
    // @ts-ignore - acquireVsCodeApi is provided by VSCode
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const clearBtn = document.getElementById('clear-btn');
    const abortBtn = document.getElementById('abort-btn');
    const typingIndicator = document.getElementById('typing-indicator');
    const tempRange = document.getElementById('temp-range');
    const tempVal = document.getElementById('temp-val');
    const modelSelect = document.getElementById('model-select');

    // Streaming state
    let isStreaming = false;
    let currentStreamingMessage = null;  // Reference to the streaming message div

    // Temperature slider display
    tempRange.addEventListener('input', (e) => {
        tempVal.textContent = e.target.value;
    });

    // Notify extension that webview is ready
    vscode.postMessage({ command: 'ready' });

    /**
     * Populates the model dropdown with available models.
     * @param {Array<{id: string, name: string, provider: string}>} models 
     */
    function populateModels(models) {
        modelSelect.innerHTML = '';
        
        // Group models by provider
        const providers = {};
        models.forEach(model => {
            if (!providers[model.provider]) {
                providers[model.provider] = [];
            }
            providers[model.provider].push(model);
        });

        // Create optgroups for each provider
        Object.keys(providers).forEach(provider => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = provider;
            
            providers[provider].forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                optgroup.appendChild(option);
            });
            
            modelSelect.appendChild(optgroup);
        });
    }

    /**
     * Sends the current message to the assistant.
     */
    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text) return;

        // Gather options
        const model = modelSelect.value;
        const temperature = parseFloat(tempRange.value);
        const includeHighlights = document.getElementById('include-highlights').checked;
        const enableStreaming = document.getElementById('enable-streaming').checked;
        const filterStr = document.getElementById('filter-input').value;

        let filter = undefined;
        try {
            if (filterStr && filterStr.trim()) {
                filter = JSON.parse(filterStr);
            }
        } catch (e) {
            console.error('Invalid filter JSON:', e);
        }

        const options = {
            model,
            temperature,
            include_highlights: includeHighlights,
            filter,
            stream: enableStreaming
        };

        // Update UI
        addMessage('user', text);
        messageInput.value = '';
        
        if (enableStreaming) {
            // Show abort button for streaming
            isStreaming = true;
            sendBtn.disabled = true;
            sendBtn.classList.add('hidden');
            abortBtn.classList.remove('hidden');
        } else {
            // Show typing indicator for non-streaming
            typingIndicator.classList.remove('hidden');
            sendBtn.disabled = true;
        }

        // Send to extension
        vscode.postMessage({
            command: 'sendMessage',
            text,
            options
        });
    }

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    clearBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'clearChat' });
        messagesDiv.innerHTML = '';
        resetStreamingState();
    });

    // Abort button for streaming
    abortBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'abortStream' });
    });

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'setModels':
                populateModels(message.models);
                break;
            case 'receiveMessage':
                typingIndicator.classList.add('hidden');
                sendBtn.disabled = false;
                addMessage('assistant', message.response.message.content, message.response.citations);
                break;
            case 'error':
                typingIndicator.classList.add('hidden');
                sendBtn.disabled = false;
                handleError(message.message);
                break;
            case 'authExpired':
                typingIndicator.classList.add('hidden');
                resetStreamingState();
                sendBtn.disabled = true;
                showAuthExpired();
                break;
            case 'setAssistant':
                document.getElementById('assistant-name').textContent = message.name;
                break;
            case 'clear':
                messagesDiv.innerHTML = '';
                resetStreamingState();
                break;
            
            // Streaming messages
            case 'streamStart':
                startStreamingMessage();
                break;
            case 'streamChunk':
                appendToStreamingMessage(message.content);
                break;
            case 'streamCitation':
                queueStreamingCitation(message.citation);
                break;
            case 'streamEnd':
                finalizeStreamingMessage(message.citations);
                break;
            case 'streamError':
                handleStreamingError(message.message);
                break;
            case 'streamAborted':
                handleStreamAborted();
                break;
            case 'streamUsage':
                // Could display usage info if desired
                console.log('Token usage:', message.usage);
                break;
        }
    });

    /**
     * Adds a message to the chat display.
     * @param {string} role - 'user', 'assistant', or 'error'
     * @param {string} content - Message content
     * @param {Array} [citations] - Optional citations for assistant messages
     */
    function addMessage(role, content, citations) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        
        // Escape HTML and convert newlines
        let html = escapeHtml(String(content || '')).replace(/\n/g, '<br>');

        // Add citations if present
        if (Array.isArray(citations) && citations.length > 0) {
            html += '<div class="citations-panel"><strong>Citations:</strong>';
            citations.forEach((citation, index) => {
                const refsArray = Array.isArray(citation.references) ? citation.references : [];
                const refs = refsArray.map(ref => {
                    const fileName = ref.file && ref.file.name ? ref.file.name : 'Unknown';
                    let refText = escapeHtml(fileName);
                    if (ref.pages) {
                        refText += ` (p. ${ref.pages.join(', ')})`;
                    }
                    return `<div class="citation-item">[${index + 1}] ${refText}</div>`;
                }).join('');
                html += refs;
            });
            html += '</div>';
        }

        div.innerHTML = html;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    /**
     * Escapes HTML special characters to prevent XSS.
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
            addMessage('error', errorMessage);
        }
    }

    /**
     * Shows authentication expired message with login action.
     */
    function showAuthExpired() {
        const div = document.createElement('div');
        div.className = 'message auth-expired';
        div.innerHTML = `
            <div class="auth-expired-content">
                <strong>Session Expired</strong>
                <p>Your authentication has expired. Please log in again to continue.</p>
                <button onclick="requestLogin()" class="login-btn">Login</button>
            </div>
        `;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    /**
     * Requests the extension to initiate login.
     */
    window.requestLogin = function() {
        vscode.postMessage({ command: 'requestLogin' });
    };

    // =========================================================================
    // Streaming Support Functions
    // =========================================================================

    /** Citations accumulated during streaming */
    let streamingCitations = [];

    /**
     * Resets the streaming state and UI.
     */
    function resetStreamingState() {
        isStreaming = false;
        currentStreamingMessage = null;
        streamingCitations = [];
        sendBtn.classList.remove('hidden');
        sendBtn.disabled = false;
        abortBtn.classList.add('hidden');
    }

    /**
     * Starts a new streaming message in the chat.
     */
    function startStreamingMessage() {
        isStreaming = true;
        streamingCitations = [];
        
        // Create the message container
        const div = document.createElement('div');
        div.className = 'message assistant streaming';
        div.innerHTML = '<span class="streaming-cursor">|</span>';
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        currentStreamingMessage = div;
    }

    /**
     * Appends content to the current streaming message.
     * @param {string} content - The content chunk to append
     */
    function appendToStreamingMessage(content) {
        if (!currentStreamingMessage) return;
        
        // Get current content (excluding cursor)
        const cursorSpan = currentStreamingMessage.querySelector('.streaming-cursor');
        let currentContent = '';
        
        // Get text before the cursor
        const childNodes = currentStreamingMessage.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            if (childNodes[i] !== cursorSpan) {
                if (childNodes[i].nodeType === Node.TEXT_NODE) {
                    currentContent += childNodes[i].textContent;
                } else if (childNodes[i].tagName === 'BR') {
                    currentContent += '\n';
                }
            }
        }
        
        // Append new content
        currentContent += content;
        
        // Re-render with cursor at end
        currentStreamingMessage.innerHTML = escapeHtml(currentContent).replace(/\n/g, '<br>') +
            '<span class="streaming-cursor">|</span>';
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    /**
     * Queues a citation received during streaming.
     * @param {Object} citation - The citation object
     */
    function queueStreamingCitation(citation) {
        streamingCitations.push(citation);
    }

    /**
     * Finalizes the streaming message, removing cursor and adding citations.
     * @param {Array} [citations] - Final citations array (if different from accumulated)
     */
    function finalizeStreamingMessage(citations) {
        if (!currentStreamingMessage) {
            resetStreamingState();
            return;
        }
        
        // Remove streaming class and cursor
        currentStreamingMessage.classList.remove('streaming');
        const cursor = currentStreamingMessage.querySelector('.streaming-cursor');
        if (cursor) {
            cursor.remove();
        }
        
        // Use provided citations or accumulated ones
        const finalCitations = citations || streamingCitations;
        
        // Add citations if present
        if (finalCitations && finalCitations.length > 0) {
            const citationsHtml = createCitationsHtml(finalCitations);
            currentStreamingMessage.innerHTML += citationsHtml;
        }
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        resetStreamingState();
    }

    /**
     * Handles a streaming error.
     * @param {string} errorMessage - The error message
     */
    function handleStreamingError(errorMessage) {
        if (currentStreamingMessage) {
            // Mark the message as having an error
            currentStreamingMessage.classList.remove('streaming');
            currentStreamingMessage.classList.add('stream-error');
            const cursor = currentStreamingMessage.querySelector('.streaming-cursor');
            if (cursor) {
                cursor.remove();
            }
            currentStreamingMessage.innerHTML += '<br><em class="stream-error-text">[Error: ' + escapeHtml(errorMessage) + ']</em>';
        } else {
            addMessage('error', errorMessage);
        }
        resetStreamingState();
    }

    /**
     * Handles stream abort by user.
     */
    function handleStreamAborted() {
        if (currentStreamingMessage) {
            // Mark the message as stopped
            currentStreamingMessage.classList.remove('streaming');
            const cursor = currentStreamingMessage.querySelector('.streaming-cursor');
            if (cursor) {
                cursor.remove();
            }
            currentStreamingMessage.innerHTML += '<br><em class="stream-stopped">[Stopped by user]</em>';
        }
        resetStreamingState();
    }

    /**
     * Creates HTML for citations panel.
     * @param {Array} citations - Array of citation objects
     * @returns {string} HTML string for citations
     */
    function createCitationsHtml(citations) {
        if (!citations || citations.length === 0) return '';
        
        let html = '<div class="citations-panel"><strong>Citations:</strong>';
        citations.forEach((citation, index) => {
            if (citation.references) {
                citation.references.forEach(ref => {
                    let refText = escapeHtml(ref.file ? ref.file.name : 'Unknown');
                    if (ref.pages) {
                        refText += ` (p. ${ref.pages.join(', ')})`;
                    }
                    html += `<div class="citation-item">[${index + 1}] ${refText}</div>`;
                });
            }
        });
        html += '</div>';
        return html;
    }
})();
