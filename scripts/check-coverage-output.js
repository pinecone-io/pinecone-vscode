#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const candidates = [
  'coverage/lcov.info',
  'coverage/coverage-summary.json',
  'coverage/coverage-final.json',
  '.nyc_output/out.json',
  '.nyc_output/coverage.json',
  '.coverage'
];

const hasCandidate = candidates.some((relativePath) => {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return fs.existsSync(absolutePath);
});

const nycDir = path.resolve(process.cwd(), '.nyc_output');
const hasNycJson = fs.existsSync(nycDir)
  ? fs.readdirSync(nycDir).some((file) => file.endsWith('.json'))
  : false;

if (!hasCandidate && !hasNycJson) {
  console.error('Coverage check failed: no coverage artifact was produced.');
  console.error('Expected one of:', candidates.join(', '));
  process.exit(1);
}

console.log('Coverage artifacts detected.');
