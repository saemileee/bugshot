# Version Management Guide

This document describes the versioning workflow for BugShot.

## Versioning Strategy

BugShot follows [Semantic Versioning](https://semver.org/) (SemVer):

```
MAJOR.MINOR.PATCH
```

### When to bump each component:

#### MAJOR (X.0.0)
Breaking changes that affect users or require migration:
- Chrome Extension Manifest V3 → V4
- Complete architecture rewrite
- Removing existing features
- Incompatible API changes

#### MINOR (0.X.0)
New features, backwards-compatible additions:
- New capture modes (region, element, etc.)
- New integration platforms (Slack, Linear, etc.)
- Major UI redesigns
- Significant performance optimizations
- New configuration options

#### PATCH (0.0.X)
Bug fixes and minor improvements:
- Bug fixes
- Typo corrections
- Dependency updates (security patches)
- Minor UI tweaks
- Performance improvements (non-breaking)

## Release Workflow

### 1. Make Changes
Develop features, fix bugs, commit regularly:
```bash
git add .
git commit -m "feat: add region screenshot capture"
git commit -m "fix: resolve shadow DOM event handling"
```

### 2. Bump Version
Use the provided npm scripts:

```bash
# For new features
npm run version:minor

# For bug fixes
npm run version:patch

# For breaking changes
npm run version:major
```

Or use the script directly:
```bash
node scripts/bump-version.js minor
```

This will automatically update:
- `package.json` version
- `src/manifest.ts` version

### 3. Update CHANGELOG.md

Add an entry for the new version at the top:

```markdown
## [1.2.0] - 2025-03-15

### Added
- New feature description
- Another feature

### Changed
- What changed

### Fixed
- Bug fix description

### Performance
- Performance improvement notes
```

Categories to use:
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed
- **Removed**: Features that were removed
- **Fixed**: Bug fixes
- **Security**: Security fixes
- **Performance**: Performance improvements

### 4. Commit Version Bump

```bash
git add -A
git commit -m "chore: bump version to 1.2.0"
```

### 5. Create Git Tag

```bash
git tag v1.2.0
```

### 6. Push to Remote

```bash
git push
git push --tags
```

## Quick Reference

### Full Release Flow
```bash
# 1. Develop and commit changes
git add .
git commit -m "feat: add new feature"

# 2. Bump version
npm run version:minor

# 3. Update CHANGELOG.md manually
# (Add release notes for the new version)

# 4. Commit version bump
git add -A
git commit -m "chore: bump version to 1.2.0"

# 5. Tag and push
git tag v1.2.0
git push && git push --tags
```

## Version File Locations

The version number is stored in two places:

1. **package.json** (`version` field)
2. **src/manifest.ts** (`version` field)

The bump script keeps both in sync automatically.

## Chrome Web Store Publishing

After tagging a release:

1. Run production build:
   ```bash
   npm run build
   ```

2. Create distribution zip:
   ```bash
   cd dist
   zip -r ../bugshot-v1.2.0.zip *
   cd ..
   ```

3. Upload to Chrome Web Store Developer Dashboard
4. Fill in release notes from CHANGELOG.md
5. Submit for review

## Tips

- **Always update CHANGELOG.md** before committing the version bump
- **Write clear commit messages** following [Conventional Commits](https://www.conventionalcommits.org/)
- **Test thoroughly** before bumping versions
- **Document breaking changes** prominently in CHANGELOG
- **Keep versions in sync** - use the bump script instead of manual edits
