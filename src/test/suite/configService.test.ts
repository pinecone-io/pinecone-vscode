/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type ConfigServiceType = {
    new (): {
        getSecrets: () => Record<string, unknown>;
        saveSecrets: (secrets: Record<string, unknown>) => void;
        getState: () => Record<string, unknown>;
        saveState: (state: Record<string, unknown>) => void;
        getConfig: () => Record<string, unknown>;
        saveConfig: (config: Record<string, unknown>) => void;
        setTargetOrganization: (org: { id: string; name: string } | undefined) => void;
        clearTargetContext: () => void;
    };
};

type ConstantsType = {
    PINECONE_CONFIG_DIR: string;
    SECRETS_FILE: string;
    STATE_FILE: string;
    CONFIG_FILE: string;
};

suite('ConfigService (Production Class)', () => {
    let tempHome: string;
    let originalHome: string | undefined;

    let ConfigServiceClass: ConfigServiceType;
    let constants: ConstantsType;

    setup(() => {
        originalHome = process.env.HOME;
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pinecone-config-test-'));
        process.env.HOME = tempHome;

        delete require.cache[require.resolve('../../utils/constants')];
        delete require.cache[require.resolve('../../services/configService')];

        constants = require('../../utils/constants') as ConstantsType;
        ConfigServiceClass = (require('../../services/configService') as { ConfigService: ConfigServiceType }).ConfigService;
    });

    teardown(() => {
        if (originalHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = originalHome;
        }

        fs.rmSync(tempHome, { recursive: true, force: true });

        delete require.cache[require.resolve('../../utils/constants')];
        delete require.cache[require.resolve('../../services/configService')];
    });

    test('constructor ensures the Pinecone config directory exists', () => {
        new ConfigServiceClass();
        assert.ok(fs.existsSync(constants.PINECONE_CONFIG_DIR));
    });

    test('saveSecrets writes mode 0600 and getSecrets reads persisted values', () => {
        const service = new ConfigServiceClass();
        service.saveSecrets({ api_key: 'pcsk_test_key' });

        const stat = fs.statSync(constants.SECRETS_FILE);
        const mode = stat.mode & 0o777;
        assert.strictEqual(mode, 0o600);

        const secrets = service.getSecrets();
        assert.strictEqual(secrets.api_key, 'pcsk_test_key');
    });

    test('getState returns empty object when YAML is malformed', () => {
        const service = new ConfigServiceClass();
        fs.writeFileSync(constants.STATE_FILE, '[');

        const state = service.getState();
        assert.deepStrictEqual(state, {});
    });

    test('setTargetOrganization clears target_project when organization changes', () => {
        const service = new ConfigServiceClass();
        service.saveState({
            target_org: { id: 'org-a', name: 'Org A' },
            target_project: { id: 'proj-a', name: 'Project A' }
        });

        service.setTargetOrganization({ id: 'org-b', name: 'Org B' });
        const state = service.getState();

        assert.strictEqual((state.target_org as { id: string }).id, 'org-b');
        assert.strictEqual(state.target_project, undefined);
    });

    test('clearTargetContext removes both target organization and target project', () => {
        const service = new ConfigServiceClass();
        service.saveState({
            target_org: { id: 'org-a', name: 'Org A' },
            target_project: { id: 'proj-a', name: 'Project A' }
        });

        service.clearTargetContext();
        const state = service.getState();

        assert.strictEqual(state.target_org, undefined);
        assert.strictEqual(state.target_project, undefined);
    });

    test('saveConfig and getConfig round-trip app preferences', () => {
        const service = new ConfigServiceClass();

        service.saveConfig({
            default_region: 'us-east-1',
            output_format: 'json',
            telemetry_disabled: true
        });

        const config = service.getConfig();
        assert.strictEqual(config.default_region, 'us-east-1');
        assert.strictEqual(config.output_format, 'json');
        assert.strictEqual(config.telemetry_disabled, true);
        assert.ok(fs.existsSync(constants.CONFIG_FILE));
    });
});
