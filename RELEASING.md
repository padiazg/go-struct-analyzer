# Release Guidelines

Lessons learned from the v2.0.0 → v2.0.3 migration: a module-path/binary-layout
mismatch combined with Go's immutable proxy caching turned a simple `go install`
fix into three burned tags. This document exists so it doesn't happen again.

> **Distribution model**: End-user installation uses the curl installer
> (`curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh`),
> not `go install`. `go install` is kept only as an internal reference in
> RELEASING.md and CONTRIBUTING.md.

## What went wrong (v2.0.0/v2.0.1 postmortem)

1. **Major version subdirectory confusion** — `go.mod` declared `module .../v2`
   at repo root, but `main.go` lived in `lsp/`, not the root. `go install
   .../v2@latest` requires a `package main` at the exact import path requested.
2. **Proxy immutability violation** — `v2.0.0` was tagged, force-moved, and
   re-pushed multiple times while iterating on the fix. `proxy.golang.org`
   caches the **first** content it sees for a given version **forever** — part
   of Go's supply-chain security model via `sum.golang.org`. Moving a tag after
   any tool has fetched it is a no-op from the ecosystem's point of view; the
   old content is permanently what that version means.
3. **Binary naming surprise** — `go install .../v2@latest` (package at module
   root ending in `/v2`) named the binary `go-struct-analyzer`, not `gsa-lsp`,
   because Go strips a trailing path element that looks like a major-version
   suffix (`vN`) and uses the next element instead.

## Rule 1 — Never reuse or move a tag once pushed

The instant a tag is pushed to a public remote, treat it as **immutable**.
Any CI job, dependabot scan, or curious request from anyone (including
your own testing) can trigger proxy or CDN caching.

- `git tag -f v2.0.0 <new commit> && git push -f origin v2.0.0` — never do this
- Cut a new tag instead: `v2.0.1`, `v2.1.0`, whatever fits semver for the change.

If you tag too early and realize something's broken **before** anyone/anything
could have fetched it (seconds, same session, no CI trigger), you *might* get
away with a force-move — but there's no reliable way to confirm nothing cached
it. Treat every push as final.

## Rule 2 — Layout the module for `cmd/`-style installs from day one

The Go binary source layout:

```
module-root/
  go.mod                    # module github.com/org/repo (or /vN for v2+)
  cmd/<binary-name>/
    main.go                 # package main — this determines the binary name
  internal/
    ...                     # implementation packages, not importable externally
```

This guarantees:

- The binary name is always `<binary-name>`. Go only strips the last path
  element if it matches `vN`; `cmd/<binary-name>` never matches that pattern.
- Adding `/v2`, `/v3` later doesn't touch the binary name — it just becomes
  `.../v2/cmd/<binary-name>`.
- Multiple binaries can coexist (`cmd/gsa-lsp`, `cmd/gsa-cli`, etc.) without
  ambiguity.

**Do this before the first public tag ever goes out.** Restructuring after
tags are public is exactly the mess this project went through.

## Rule 3 — Release process

When bumping to a new version:

1. Update `go.mod` module path and **every** internal import path (if changing major version)
2. Confirm layout follows Rule 2 (`cmd/<binary>/main.go`)
3. Build and test **fully** locally:

   ```bash
   go build ./...
   go vet ./...
   ./gsa-lsp version
   ```

4. Commit
5. **Only then** tag:

   ```bash
   git tag vN.0.0
   ```

6. Push commit **and** tag, verify both landed:

   ```bash
   git push origin <branch>
   git push origin vN.0.0
   ```

7. Trigger goreleaser via the `release.yml` workflow (tag push triggers it).
8. Verify GitHub Release artifacts:
   - Binaries for linux+darwin, amd64+arm64
   - `checksums.txt` with SHA-256 hashes
   - Source dist tarball
9. Verify the curl installer can fetch and install the new version:

   ```bash
   curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh -s -- -v vN.0.0
   gsa-lsp version
   ```

10. Verify VSIX was uploaded to the release (if tagged via `release.yml`).

## Rule 4 — If something's wrong after tagging, bump — never fix in place

Once `vX.Y.Z` is pushed:

- Bug in the tag? Cut `vX.Y.Z+1`, fix, tag, push. Never touch `vX.Y.Z` again.
- Docs stale? Fine to fix docs — but the **tag/binary content is frozen**.
- Mid-iteration fixing an install problem? Expect to burn 2-3 patch versions.
  That's normal and cheap. Abandoned tags cost nothing except a small gap in
  the version sequence.

## Rule 5 — goreleaser config must stay in sync

Keep `.goreleaser.yml` (`dist/config.yaml`) settings consistent:

```yaml
builds:
  - main: ./cmd/gsa-lsp
    binary: gsa-lsp

archives:
  - format: tar.gz
    name_template: "go-struct-analyzer_{{ .Version }}_{{ .Os }}_{{ .Arch }}"
```

- Targets must include linux+darwin, amd64+arm64
- `checksums` must be enabled (produces `checksums.txt` used by the installer)
- If you change `binary` or `main`, update both goreleaser and the installer

Review this diff explicitly in every PR that touches `.goreleaser.yml`.

## Rule 6 — Pre-flight checklist before every tag push

- [ ] `go build ./...` passes
- [ ] `go vet ./...` passes
- [ ] Binary runs and reports the right version: `./gsa-lsp version`
- [ ] `go.mod` module path matches the intended major version
- [ ] No uncommitted changes: `git status` is clean
- [ ] Tag name has never been used before: `git tag -l vX.Y.Z` locally **and**
      check the GitHub releases page — someone may have tagged manually there
- [ ] Push commit before push tag, confirm both are on the remote
- [ ] goreleaser `release.yml` workflow triggers and completes successfully
- [ ] All release artifacts present (binaries, checksums.txt, source dist)
- [ ] curl installer fetches and installs the new version successfully
- [ ] VSIX uploaded to GitHub Release (if applicable)

## Verifying the curl installer

After the goreleaser workflow completes, verify the installer can fetch and
install the new release:

```bash
# Dry run — prints steps without installing
curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh -n

# Actually install the tagged version
curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh -s -- -v v2.0.3

# Verify the installed binary
gsa-lsp version
# expected: gsa-lsp v2.0.3 (commit: <sha>, built: <date>)

# Smoke test
gsa-lsp analyze samples/test_go_file.go | head -5
```

This mirrors exactly what end users experience. If the installer fails at
any step (download, checksum verification, extraction), **do not announce
the release**. Fix the goreleaser config, cut a new patch tag, and repeat.

## Legacy: Clean-room `go install` test

> Deprecated. We no longer ship via `go install` for end users. This test
> is kept for internal verification and historical reference.

Run this after the proxy check passes. It reproduces exactly what an end
user's first-time install experiences — no local cache reuse.

```bash
# Create a fresh, throwaway GOBIN
GOBIN=$(mktemp -d)

# Install via the real public proxy, no local cache advantage
GOBIN="$GOBIN" GOSUMDB=off GOPROXY=https://proxy.golang.org \
  go install github.com/padiazg/go-struct-analyzer/v2/cmd/gsa-lsp@v2.0.3

# Verify binary name — must be "gsa-lsp", not "go-struct-analyzer"
ls "$GOBIN"

# Verify it runs and reports the correct version
"$GOBIN"/gsa-lsp version
# expected: gsa-lsp v2.0.3 (commit: <sha>, built: <date>)

# Smoke test — must produce JSON output, not an error
"$GOBIN"/gsa-lsp analyze samples/test_go_file.go | head -5

# Clean up
rm -rf "$GOBIN"
```

If this step fails, **do not announce the release**. Cut another patch tag,
push it, and repeat from step 8 of [Rule 3](#rule-3--major-version-bumps-v2-v3---sequence-matters).
