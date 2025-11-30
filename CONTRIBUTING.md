# Contributing to AI Test Harness

Thank you for your interest in contributing to AI Test Harness! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Release Process](#release-process)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Git

### Installation

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ai-test-harness.git
   cd ai-test-harness
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the packages:
   ```bash
   npm run build
   ```

5. Verify everything works:
   ```bash
   npm run type-check
   npm run lint
   ```

## Development Workflow

### Monorepo Structure

This is a monorepo managed with npm workspaces:

- `packages/core` - Core testing framework
- `packages/cli` - CLI tool for scaffolding and running tests

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build:core
npm run build:cli
```

### Type Checking

```bash
npm run type-check
```

### Linting and Formatting

```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feat/your-feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/documentation-update` - Documentation changes
- `refactor/code-improvement` - Code refactoring
- `test/test-additions` - Test additions or modifications

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(core): add support for Claude 3.5 Sonnet
fix(cli): resolve tenant creation validation error
docs(readme): update installation instructions
```

### Creating a Changeset

We use [Changesets](https://github.com/changesets/changesets) for version management.

When you make changes that affect the public API:

```bash
npm run changeset
```

Follow the prompts to:
1. Select which packages changed
2. Choose the version bump type (major/minor/patch)
3. Write a summary of changes

This creates a changeset file in `.changeset/` that will be used during release.

**When to create a changeset:**
- ✅ Adding new features
- ✅ Fixing bugs
- ✅ Breaking changes
- ✅ Performance improvements
- ❌ Documentation-only changes
- ❌ Internal refactoring with no API changes
- ❌ Test additions

## Submitting a Pull Request

1. **Update your fork:**
   ```bash
   git checkout main
   git pull upstream main
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

3. **Make your changes and commit:**
   ```bash
   git add .
   git commit -m "feat(core): add your feature"
   ```

4. **Create a changeset if needed:**
   ```bash
   npm run changeset
   ```

5. **Push to your fork:**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Open a Pull Request:**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changed and why
   - Include screenshots/examples if applicable

### PR Checklist

Before submitting your PR, ensure:

- [ ] Code builds successfully (`npm run build`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Tests pass (if applicable)
- [ ] Changeset created (if needed)
- [ ] Documentation updated (if needed)

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` types when possible
- Export types for public APIs

### Code Style

- Use Prettier for formatting (configured in `.prettierrc`)
- Follow ESLint rules (configured in `eslint.config.mjs`)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### File Organization

- One component/class per file
- Keep files focused and under 300 lines when possible
- Use index files for clean exports

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test -w @ai-test-harness/core
npm test -w @ai-test-harness/cli
```

### Writing Tests

- Write tests for new features
- Update tests when fixing bugs
- Aim for good coverage of public APIs
- Use descriptive test names

## Release Process

Releases are managed by maintainers using Changesets:

1. Merge PRs with changesets to `main`
2. Changesets bot creates a "Version Packages" PR
3. Maintainer reviews and merges the version PR
4. Packages are automatically published to npm
5. GitHub releases are created with changelogs

## Questions?

If you have questions or need help:

- Open an issue with the `question` label
- Check existing issues and discussions
- Review the documentation in `/docs`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
