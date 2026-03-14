(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const modeSelect = document.getElementById('index-mode');
    const standardSection = document.getElementById('standard-section');
    const integratedSection = document.getElementById('integrated-section');
    const standardVectorType = document.getElementById('standard-vector-type');
    const standardDimensionGroup = document.getElementById('standard-dimension-group');
    const standardMetricGroup = document.getElementById('standard-metric-group');
    const integratedModelSelect = document.getElementById('integrated-model');
    const integratedDimensionSelect = document.getElementById('integrated-dimension');
    const integratedDimensionGroup = document.getElementById('integrated-dimension-group');
    const errorDiv = document.getElementById('error');
    const createBtn = document.getElementById('create-btn');

    let cloudRegions = {};
    let embeddingModels = [];

    function showError(message) {
        errorDiv.textContent = message || 'Unknown error';
        errorDiv.classList.remove('hidden');
    }

    function clearError() {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    function value(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function setMode() {
        const mode = modeSelect.value;
        if (mode === 'integrated') {
            standardSection.classList.add('hidden');
            integratedSection.classList.remove('hidden');
            return;
        }
        standardSection.classList.remove('hidden');
        integratedSection.classList.add('hidden');
    }

    function setStandardVectorType() {
        const vectorType = standardVectorType.value;
        if (vectorType === 'sparse') {
            standardDimensionGroup.classList.add('hidden');
            standardMetricGroup.classList.add('hidden');
            return;
        }
        standardDimensionGroup.classList.remove('hidden');
        standardMetricGroup.classList.remove('hidden');
    }

    function setRegionOptions(cloudSelectId, regionSelectId) {
        const cloud = value(cloudSelectId);
        const regionSelect = document.getElementById(regionSelectId);
        const regions = Array.isArray(cloudRegions[cloud]) ? cloudRegions[cloud] : [];
        regionSelect.innerHTML = '';
        regions.forEach(region => {
            const option = new Option(region.label, region.label);
            regionSelect.appendChild(option);
        });
    }

    function populateCloudSelectors() {
        const clouds = Object.keys(cloudRegions);
        ['standard-cloud', 'integrated-cloud'].forEach(id => {
            const select = document.getElementById(id);
            select.innerHTML = '';
            clouds.forEach(cloud => {
                select.appendChild(new Option(cloud, cloud));
            });
        });
        setRegionOptions('standard-cloud', 'standard-region');
        setRegionOptions('integrated-cloud', 'integrated-region');
    }

    function refreshIntegratedModelOptions() {
        integratedModelSelect.innerHTML = '';
        embeddingModels.forEach(model => {
            const label = model.label || model.name;
            integratedModelSelect.appendChild(new Option(label, model.name));
        });
        refreshIntegratedDimensions();
    }

    function refreshIntegratedDimensions() {
        const selectedModelName = integratedModelSelect.value;
        const model = embeddingModels.find(entry => entry.name === selectedModelName);
        const dimensions = Array.isArray(model && model.dimensions) ? model.dimensions : [];
        integratedDimensionSelect.innerHTML = '';

        if (!model || model.isSparse || dimensions.length === 0) {
            integratedDimensionGroup.classList.add('hidden');
            return;
        }

        integratedDimensionGroup.classList.remove('hidden');
        dimensions.forEach(dimension => {
            const option = new Option(String(dimension), String(dimension));
            if (dimension === model.defaultDimension) {
                option.selected = true;
            }
            integratedDimensionSelect.appendChild(option);
        });
    }

    function getPayload() {
        return {
            name: value('index-name').trim(),
            mode: modeSelect.value,
            standard: {
                vectorType: value('standard-vector-type'),
                dimension: value('standard-dimension'),
                metric: value('standard-metric'),
                cloud: value('standard-cloud'),
                region: value('standard-region')
            },
            integrated: {
                model: value('integrated-model'),
                dimension: value('integrated-dimension'),
                textField: value('integrated-field-name').trim(),
                cloud: value('integrated-cloud'),
                region: value('integrated-region')
            }
        };
    }

    modeSelect.addEventListener('change', () => {
        clearError();
        setMode();
    });

    standardVectorType.addEventListener('change', () => {
        clearError();
        setStandardVectorType();
    });

    document.getElementById('standard-cloud').addEventListener('change', () => {
        setRegionOptions('standard-cloud', 'standard-region');
    });

    document.getElementById('integrated-cloud').addEventListener('change', () => {
        setRegionOptions('integrated-cloud', 'integrated-region');
    });

    integratedModelSelect.addEventListener('change', () => {
        refreshIntegratedDimensions();
    });

    createBtn.addEventListener('click', () => {
        clearError();
        createBtn.disabled = true;
        vscode.postMessage({
            command: 'submit',
            payload: getPayload()
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'init':
                cloudRegions = message.cloudRegions || {};
                embeddingModels = message.embeddingModels || [];
                populateCloudSelectors();
                refreshIntegratedModelOptions();
                setMode();
                setStandardVectorType();
                createBtn.disabled = false;
                break;
            case 'error':
                showError(message.message);
                createBtn.disabled = false;
                break;
            case 'success':
                createBtn.disabled = false;
                break;
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
