(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const keysBody = document.getElementById('keys-body');
    const errorDiv = document.getElementById('error');
    const projectName = document.getElementById('project-name');
    const rolesSelect = document.getElementById('key-roles');
    const rolesHint = document.getElementById('key-roles-hint');
    let previousRoleSelection = new Set();
    let enforceProjectEditorOnly = false;

    const ROLE = {
        projectEditor: 'ProjectEditor',
        projectViewer: 'ProjectViewer',
        controlPlaneEditor: 'ControlPlaneEditor',
        controlPlaneViewer: 'ControlPlaneViewer',
        dataPlaneEditor: 'DataPlaneEditor',
        dataPlaneViewer: 'DataPlaneViewer'
    };

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function renderKeys(keys) {
        keysBody.innerHTML = '';
        if (!keys || keys.length === 0) {
            keysBody.innerHTML = '<tr><td colspan="5">No API keys found.</td></tr>';
            return;
        }

        keys.forEach(key => {
            const tr = document.createElement('tr');
            const roles = (key.roles || []).join(', ');
            tr.innerHTML = `
                <td>${escapeHtml(key.name || '')}</td>
                <td><code>${escapeHtml(key.id || '')}</code></td>
                <td>${escapeHtml(roles)}</td>
                <td>${escapeHtml(key.created_at || '')}</td>
                <td><button class="revoke-btn" data-id="${escapeAttr(key.id || '')}" data-name="${escapeAttr(key.name || '')}">Revoke</button></td>
            `;
            keysBody.appendChild(tr);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }

    function escapeAttr(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function selectedRoleSet() {
        if (!(rolesSelect instanceof HTMLSelectElement)) {
            return new Set();
        }
        return new Set(Array.from(rolesSelect.selectedOptions).map(option => option.value));
    }

    function applySelection(selection) {
        if (!(rolesSelect instanceof HTMLSelectElement)) {
            return;
        }
        Array.from(rolesSelect.options).forEach(option => {
            option.selected = selection.has(option.value);
        });
    }

    function resolveExclusive(selection, a, b, preferredRole) {
        if (!selection.has(a) || !selection.has(b)) {
            return;
        }
        if (preferredRole === b) {
            selection.delete(a);
        } else if (preferredRole === a) {
            selection.delete(b);
        } else {
            selection.delete(b);
        }
    }

    function normalizeRoleSelection(preferredRole) {
        if (enforceProjectEditorOnly) {
            applySelection(new Set([ROLE.projectEditor]));
            previousRoleSelection = new Set([ROLE.projectEditor]);
            return;
        }
        const selection = selectedRoleSet();
        resolveExclusive(selection, ROLE.projectEditor, ROLE.projectViewer, preferredRole);
        resolveExclusive(selection, ROLE.controlPlaneEditor, ROLE.controlPlaneViewer, preferredRole);
        resolveExclusive(selection, ROLE.dataPlaneEditor, ROLE.dataPlaneViewer, preferredRole);

        const projectSelected = selection.has(ROLE.projectEditor) || selection.has(ROLE.projectViewer);
        const controlPlaneSelected = selection.has(ROLE.controlPlaneEditor) || selection.has(ROLE.controlPlaneViewer);
        const dataPlaneSelected = selection.has(ROLE.dataPlaneEditor) || selection.has(ROLE.dataPlaneViewer);
        const planeSelected = controlPlaneSelected || dataPlaneSelected;

        if (projectSelected && planeSelected) {
            const preferredIsProject = preferredRole === ROLE.projectEditor || preferredRole === ROLE.projectViewer;
            if (preferredIsProject) {
                selection.delete(ROLE.controlPlaneEditor);
                selection.delete(ROLE.controlPlaneViewer);
                selection.delete(ROLE.dataPlaneEditor);
                selection.delete(ROLE.dataPlaneViewer);
            } else {
                selection.delete(ROLE.projectEditor);
                selection.delete(ROLE.projectViewer);
            }
        }

        if (selection.size === 0) {
            selection.add(ROLE.projectEditor);
        }

        applySelection(selection);
        previousRoleSelection = new Set(selection);
    }

    function applyRolePolicy() {
        if (!(rolesSelect instanceof HTMLSelectElement)) {
            return;
        }

        if (enforceProjectEditorOnly) {
            rolesSelect.disabled = true;
            applySelection(new Set([ROLE.projectEditor]));
            previousRoleSelection = new Set([ROLE.projectEditor]);
            if (rolesHint) {
                rolesHint.textContent = 'Free tier API keys are restricted to the ProjectEditor role.';
            }
            return;
        }

        rolesSelect.disabled = false;
        if (rolesHint) {
            rolesHint.textContent = 'Select either ProjectEditor/ProjectViewer, or select neither project role and choose Control Plane/Data Plane roles. Project roles do not imply Control Plane or Data Plane roles. Key secret is shown once and never stored by the extension.';
        }
        normalizeRoleSelection();
    }

    if (rolesSelect instanceof HTMLSelectElement) {
        rolesSelect.addEventListener('change', () => {
            const current = selectedRoleSet();
            const addedRole = Array.from(current).find(role => !previousRoleSelection.has(role));
            normalizeRoleSelection(addedRole);
        });
        normalizeRoleSelection();
    }

    document.getElementById('create-key').addEventListener('click', () => {
        clearError();
        normalizeRoleSelection();
        const selectedRoles = enforceProjectEditorOnly
            ? [ROLE.projectEditor]
            : (rolesSelect instanceof HTMLSelectElement
                ? Array.from(rolesSelect.selectedOptions).map(option => option.value)
                : []);
        vscode.postMessage({
            command: 'createKey',
            payload: {
                name: document.getElementById('key-name').value,
                roles: selectedRoles
            }
        });
    });

    document.getElementById('refresh-keys').addEventListener('click', () => {
        clearError();
        vscode.postMessage({ command: 'ready' });
    });

    keysBody.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (!target.classList.contains('revoke-btn')) {
            return;
        }
        clearError();
        vscode.postMessage({
            command: 'revokeKey',
            payload: {
                keyId: target.dataset.id,
                keyName: target.dataset.name
            }
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'keys':
                renderKeys(message.keys || []);
                break;
            case 'error':
                showError(message.message);
                break;
            case 'setProject':
                projectName.textContent = message.projectName || 'Unknown Project';
                break;
            case 'rolePolicy':
                enforceProjectEditorOnly = !!message.enforceProjectEditorOnly;
                applyRolePolicy();
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
