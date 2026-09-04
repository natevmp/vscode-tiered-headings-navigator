const { defineConfig } = require('@vscode/test-cli');
const os = require('node:os');
const path = require('node:path');

const profileRoot = process.platform === 'darwin'
  ? '/tmp/thn-vsc-test'
  : path.join(os.tmpdir(), 'tiered-headings-vscode-test');

module.exports = defineConfig([
  {
    label: 'minimum',
    files: 'out/test/integration/**/*.test.js',
    version: '1.75.0',
    workspaceFolder: './test/fixtures/workspace',
    launchArgs: [
      '--disable-extensions',
      `--user-data-dir=${path.join(profileRoot, 'minimum-user-data')}`,
      `--extensions-dir=${path.join(profileRoot, 'minimum-extensions')}`
    ],
    mocha: {
      timeout: 20000
    }
  },
  {
    label: 'stable',
    files: 'out/test/integration/**/*.test.js',
    version: 'stable',
    workspaceFolder: './test/fixtures/workspace',
    launchArgs: [
      '--disable-extensions',
      `--user-data-dir=${path.join(profileRoot, 'stable-user-data')}`,
      `--extensions-dir=${path.join(profileRoot, 'stable-extensions')}`
    ],
    mocha: {
      timeout: 20000
    }
  }
]);
