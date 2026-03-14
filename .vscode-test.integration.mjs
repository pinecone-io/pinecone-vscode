import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.integration.test.js',
  version: 'stable',
  workspaceFolder: './test-fixtures',
  mocha: {
    ui: 'tdd',
    timeout: 120000
  }
});
