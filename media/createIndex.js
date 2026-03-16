(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const modeSelect = document.getElementById('index-mode');
    const standardSection = document.getElementById('standard-section');
    const integratedSection = document.getElementById('integrated-section');
    const standardVectorType = document.getElementById('standard-vector-type');
    const standardDimensionGroup = document.getElementById('standard-dimension-group');
    const standardMetricGroup = document.getElementById('standard-metric-group');
    const standardReadCapacityMode = document.getElementById('standard-read-capacity-mode');
    const standardDedicatedReadCapacity = document.getElementById('standard-dedicated-read-capacity');
    const standardReadCapacityHint = document.getElementById('standard-read-capacity-hint');
    const integratedModelSelect = document.getElementById('integrated-model');
    const integratedDimensionSelect = document.getElementById('integrated-dimension');
    const integratedDimensionGroup = document.getElementById('integrated-dimension-group');
    const errorDiv = document.getElementById('error');
    const createBtn = document.getElementById('create-btn');

    let cloudRegions = {};
    let embeddingModels = [];
    let isFreeTier = false;
    let freeTierCloud = 'aws';
    let freeTierRegion = 'us-east-1';

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

    function setStandardReadCapacityMode() {
        if (standardReadCapacityMode.value === 'Dedicated') {
            standardDedicatedReadCapacity.classList.remove('hidden');
            return;
        }
        standardDedicatedReadCapacity.classList.add('hidden');
    }

    function setRegionOptions(cloudSelectId, regionSelectId) {
        const cloud = value(cloudSelectId);
        const regionSelect = document.getElementById(regionSelectId);
        if (isFreeTier) {
            regionSelect.innerHTML = '';
            regionSelect.appendChild(new Option(freeTierRegion, freeTierRegion));
            regionSelect.value = freeTierRegion;
            return;
        }
        const regions = Array.isArray(cloudRegions[cloud]) ? cloudRegions[cloud] : [];
        regionSelect.innerHTML = '';
        regions.forEach(region => {
            const option = new Option(region.label, region.label);
            regionSelect.appendChild(option);
        });
    }

    function populateCloudSelectors() {
        const clouds = isFreeTier ? [freeTierCloud] : Object.keys(cloudRegions);
        ['standard-cloud', 'integrated-cloud'].forEach(id => {
            const select = document.getElementById(id);
            select.innerHTML = '';
            clouds.forEach(cloud => {
                select.appendChild(new Option(cloud, cloud));
            });
            if (isFreeTier) {
                select.value = freeTierCloud;
                select.disabled = true;
            } else {
                select.disabled = false;
            }
        });
        setRegionOptions('standard-cloud', 'standard-region');
        setRegionOptions('integrated-cloud', 'integrated-region');
        ['standard-region', 'integrated-region'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.disabled = isFreeTier;
            }
        });
    }

    function applyFreeTierRestrictions() {
        const dedicatedOption = standardReadCapacityMode.querySelector('option[value="Dedicated"]');
        if (dedicatedOption) {
            dedicatedOption.disabled = isFreeTier;
        }
        if (isFreeTier) {
            standardReadCapacityMode.value = 'OnDemand';
            standardReadCapacityMode.disabled = true;
            if (standardReadCapacityHint) {
                standardReadCapacityHint.textContent = 'Dedicated Read Nodes are not available on the Free plan.';
            }
        } else {
            standardReadCapacityMode.disabled = false;
            if (standardReadCapacityHint) {
                standardReadCapacityHint.textContent = 'Dedicated Read Nodes are only supported for Bring Your Own Vectors indexes in this extension.';
            }
        }
        setStandardReadCapacityMode();
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
                region: value('standard-region'),
                readCapacity: {
                    mode: value('standard-read-capacity-mode'),
                    nodeType: value('standard-read-capacity-node-type'),
                    replicas: value('standard-read-capacity-replicas'),
                    shards: value('standard-read-capacity-shards')
                }
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

    standardReadCapacityMode.addEventListener('change', () => {
        clearError();
        setStandardReadCapacityMode();
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
                isFreeTier = !!message.isFreeTier;
                freeTierCloud = message.freeTierCloud || 'aws';
                freeTierRegion = message.freeTierRegion || 'us-east-1';
                populateCloudSelectors();
                refreshIntegratedModelOptions();
                applyFreeTierRestrictions();
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
