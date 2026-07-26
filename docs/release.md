# Release Checklist

This fork currently treats release as a quality gate and GitHub release process.
Publishing a new npm package name/scope is maintainer-owned and intentionally not automated here.

- GitHub Release: `ItsDalk-Lane/pi-web`

Use this checklist from a clean `main` checkout.

## 1. Preflight

```bash
git status --short --branch
git log --oneline --decorate -5
gh auth status
npm whoami
node -e "const p=require('./package.json'); console.log(p.version)"
```

Expected:

- `git status` is clean, or only contains changes you intentionally plan to release.
- GitHub is authenticated as an account that can push and create releases.
- npm authentication is optional unless maintainers explicitly re-enable package publishing.

## 2. Run release quality gate

```bash
npm run release
```

The release script runs `check + build` and stops on any failure.

Notes:

- This does not publish to npm in this fork.
- It intentionally runs a production build. Do not run `next build` during normal development; release work is the exception.

## 3. Commit the Version Bump

Replace `<version>` with the new package version, for example `0.7.5`.

```bash
git diff -- package.json package-lock.json
git add package.json package-lock.json
git commit -m "Release v<version>"
```

## 4. Tag and Push

```bash
git tag -a v<version> -m "v<version>"
git push origin main --tags
```

Confirm the tag does not already exist before creating it when unsure:

```bash
git ls-remote --tags origin v<version>
gh release view v<version> --repo ItsDalk-Lane/pi-web
```

## 5. Generate Release Notes from Commits

Use the previous release tag as the base.

```bash
git log --oneline --decorate v<previous>..v<version>
git log --format='%h%x09%s%n%b' v<previous>..v<version>
git diff --stat v<previous>..v<version>
```

Write the release notes from those commits, not from memory. Include both Chinese and English sections. Keep commit hashes next to each item when useful.

Suggested structure:

```markdown
## 中文

基于 `v<previous>..v<version>` 的提交整理。

### 新增

- ...

### 修复

- ...

### 改进

- ...

### 内部调整

- 本仓库默认不发布 npm 包；如要发布，请先确认包名和所有权。

## English

Prepared from commits in `v<previous>..v<version>`.

### Added

- ...

### Fixed

- ...

### Improved

- ...

### Internal

- npm publishing is disabled by default in this fork; confirm package ownership before enabling.
```

## 6. Create or Update the GitHub Release

Create a new release:

```bash
gh release create v<version> \
--repo ItsDalk-Lane/pi-web \
  --verify-tag \
  --title "v<version>" \
  --notes-file release-notes.md
```

If the release already exists and only the notes need updating:

```bash
gh release edit v<version> \
  --repo ItsDalk-Lane/pi-web \
  --notes-file release-notes.md
```

You can avoid a temporary file by passing notes through stdin:

```bash
gh release edit v<version> --repo ItsDalk-Lane/pi-web --notes-file - <<'EOF'
## 中文

...

## English

...
EOF
```

## 7. Final Verification

```bash
gh release view v<version> --repo ItsDalk-Lane/pi-web
git status --short --branch
git log --oneline --decorate -3
```

Expected:

- GitHub Release exists and is not a draft unless intentionally published as one.
- `main` is aligned with `origin/main`.
- `HEAD` points at the release commit and `v<version>` tag.
