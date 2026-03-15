#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS_TO_REMOVE = ['.vscode-test', '.coverage', 'coverage', '.nyc_output'];
const FILE_PATTERNS = [/^pinecone-vscode-.*\.vsix$/];

for (const relative of DIRS_TO_REMOVE) {
  const target = path.join(ROOT, relative);
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function removeDsStore(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDsStore(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name === '.DS_Store') {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

removeDsStore(ROOT);

let rootEntries = [];
try {
  rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });
} catch {
  rootEntries = [];
}

for (const entry of rootEntries) {
  if (!entry.isFile()) {
    continue;
  }
  if (FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
    try {
      fs.unlinkSync(path.join(ROOT, entry.name));
    } catch {
      // Best-effort cleanup only.
    }
  }
}

console.log('Workspace artifacts cleaned.');
