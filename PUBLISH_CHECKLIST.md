# Publishing Checklist

This document provides a checklist for publishing your packages to npm.

## ✅ Pre-Publishing Setup (Completed)

- [x] Changesets installed and configured
- [x] LICENSE file created
- [x] CONTRIBUTING.md added
- [x] CHANGELOG.md files created
- [x] package.json files updated with repository info
- [x] .npmignore files configured
- [x] GitHub Actions workflows created
- [x] README files updated with badges
- [x] Build passes successfully
- [x] Type checking passes
- [x] Linting passes (warnings are acceptable)
- [x] Code formatting is consistent

## 📦 Before First Publish

### 1. Create npm Account
If you don't have an npm account:
```bash
npm adduser
```

Or login to existing account:
```bash
npm login
```

### 2. Verify Package Names Available
Check if package names are available on npm:
- https://www.npmjs.com/package/@ai-test-harness/core
- https://www.npmjs.com/package/@ai-test-harness/cli

If taken, update package names in:
- `packages/core/package.json`
- `packages/cli/package.json`
- Update dependencies in CLI to reference new core package name

### 3. Get npm Token
```bash
npm token create --read-only=false
```

Copy the token for GitHub Actions.

### 4. Add GitHub Secret
1. Go to: https://github.com/c2pig/ai-test-harness/settings/secrets/actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: [paste your npm token]
5. Click "Add secret"

### 5. Push Your Changes
```bash
git add .
git commit -m "chore: setup for open source publishing"
git push origin main
```

## 🚀 Publishing Workflow

### Option A: Automated (Recommended)

1. **Create a changeset** for your changes:
   ```bash
   npm run changeset
   ```
   - Select which packages changed (core, cli, or both)
   - Choose version bump type:
     - `patch` (1.0.0 → 1.0.1) - Bug fixes
     - `minor` (1.0.0 → 1.1.0) - New features (backward compatible)
     - `major` (1.0.0 → 2.0.0) - Breaking changes
   - Write a summary of changes (will appear in CHANGELOG)

2. **Commit the changeset**:
   ```bash
   git add .changeset/
   git commit -m "chore: add changeset for [your changes]"
   git push
   ```

3. **Wait for Changesets bot**:
   - A PR titled "chore: version packages" will be auto-created
   - This PR updates versions and CHANGELOGs

4. **Review and merge the PR**:
   - Check version numbers are correct
   - Review CHANGELOG entries
   - Merge the PR

5. **Automated publish**:
   - GitHub Actions will automatically publish to npm
   - GitHub releases will be created with changelogs

### Option B: Manual

1. **Update versions**:
   ```bash
   npm run version-packages
   ```

2. **Review changes**:
   - Check package.json versions
   - Review CHANGELOG updates

3. **Commit version changes**:
   ```bash
   git add .
   git commit -m "chore: version packages"
   git push
   ```

4. **Publish manually**:
   ```bash
   npm run release
   ```

## 📋 Post-Publishing

### Verify Publication
1. Check npm:
   - https://www.npmjs.com/package/@ai-test-harness/core
   - https://www.npmjs.com/package/@ai-test-harness/cli

2. Test installation:
   ```bash
   # Test core package
   npm install @ai-test-harness/core

   # Test CLI package
   npx @ai-test-harness/cli --version
   ```

### Update Documentation
- Update README badges if needed
- Announce release on GitHub Discussions
- Share on social media if desired

## 🔄 Subsequent Releases

For future releases, simply:

1. Make your changes
2. Run `npm run changeset` to document changes
3. Commit and push
4. Merge the auto-generated version PR
5. Packages publish automatically

## 🛡️ Best Practices

### When to Create Changesets
- ✅ New features
- ✅ Bug fixes
- ✅ Breaking changes
- ✅ Performance improvements
- ❌ Documentation-only changes
- ❌ Internal refactoring (no API changes)
- ❌ Test-only changes

### Version Bump Guidelines

**Patch (1.0.x)**
- Bug fixes
- Documentation updates
- Internal refactoring
- Dependency updates (non-breaking)

**Minor (1.x.0)**
- New features (backward compatible)
- New public APIs
- Deprecations (with backward compatibility)
- Significant performance improvements

**Major (x.0.0)**
- Breaking API changes
- Removed deprecated features
- Significant architectural changes
- Incompatible dependency updates

### Security
- Never commit .npmrc with auth tokens
- Rotate npm tokens periodically
- Use `npm audit` to check for vulnerabilities
- Keep dependencies updated

## 🐛 Troubleshooting

### Publish Fails with Authentication Error
- Verify `NPM_TOKEN` secret is set in GitHub
- Check token hasn't expired: `npm token list`
- Regenerate token if needed

### Package Already Published
- You cannot republish the same version
- Bump version and try again
- Use `npm run changeset` to create new version

### Build Fails in CI
- Run locally first: `npm run build && npm run type-check && npm run lint`
- Check GitHub Actions logs for detailed errors
- Ensure all dependencies are in package.json

### Changeset PR Not Created
- Ensure changesets are committed and pushed
- Check GitHub Actions is enabled for the repo
- Verify `GITHUB_TOKEN` permissions (should be automatic)

## 📚 Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
