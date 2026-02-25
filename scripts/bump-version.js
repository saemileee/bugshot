#!/usr/bin/env node

/**
 * Version Bump Script
 *
 * Usage:
 *   node scripts/bump-version.js <major|minor|patch>
 *
 * Examples:
 *   node scripts/bump-version.js patch   # 1.1.0 -> 1.1.1
 *   node scripts/bump-version.js minor   # 1.1.0 -> 1.2.0
 *   node scripts/bump-version.js major   # 1.1.0 -> 2.0.0
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}. Use major, minor, or patch.`);
  }
}

function updatePackageJson(newVersion) {
  const packagePath = resolve(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const oldVersion = packageJson.version;

  packageJson.version = newVersion;
  writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

  return oldVersion;
}

function updateManifest(newVersion) {
  const manifestPath = resolve(rootDir, 'src/manifest.ts');
  let manifestContent = readFileSync(manifestPath, 'utf8');

  // Replace version line
  manifestContent = manifestContent.replace(
    /version: '[^']+'/,
    `version: '${newVersion}'`
  );

  writeFileSync(manifestPath, manifestContent);
}

function main() {
  const bumpType = process.argv[2];

  if (!bumpType || !['major', 'minor', 'patch'].includes(bumpType)) {
    log('Usage: node scripts/bump-version.js <major|minor|patch>', 'red');
    log('\nExamples:', 'cyan');
    log('  node scripts/bump-version.js patch   # 1.1.0 -> 1.1.1');
    log('  node scripts/bump-version.js minor   # 1.1.0 -> 1.2.0');
    log('  node scripts/bump-version.js major   # 1.1.0 -> 2.0.0');
    process.exit(1);
  }

  try {
    // Read current version from package.json
    const packagePath = resolve(rootDir, 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    const currentVersion = packageJson.version;

    // Calculate new version
    const newVersion = bumpVersion(currentVersion, bumpType);

    log(`\nBumping version: ${currentVersion} -> ${newVersion}`, 'cyan');

    // Update files
    log('\nUpdating files...', 'yellow');
    updatePackageJson(newVersion);
    log('  ✓ package.json', 'green');

    updateManifest(newVersion);
    log('  ✓ src/manifest.ts', 'green');

    log(`\n✨ Version bumped to ${newVersion}`, 'green');
    log('\nNext steps:', 'yellow');
    log(`  1. Update CHANGELOG.md with [${newVersion}] entry`);
    log('  2. Commit changes: git add -A && git commit -m "chore: bump version to ' + newVersion + '"');
    log('  3. Create git tag: git tag v' + newVersion);
    log('  4. Push with tags: git push && git push --tags');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
