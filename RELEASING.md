# Release Guidelines

Lessons learned from the v2.0.0 → v2.0.3 migration: a module-path/binary-layout
mismatch combined with Go's immutable proxy caching turned a simple `go install`
fix into three burned tags. This document exists so it doesn't happen again.

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

The instant a tag is pushed to a public remote, treat it as **immutable**, even
if nobody has run `go install` yet. Any CI job, dependabot scan, or curious
`go list -m` from anyone (including your own testing) can trigger proxy caching.

- `git tag -f v2.0.0 <new commit> && git push -f origin v2.0.0` — never do this
- Cut a new tag instead: `v2.0.1`, `v2.1.0`, whatever fits semver for the change.

If you tag too early and realize something's broken **before** anyone/anything
could have fetched it (seconds, same session, no CI trigger), you *might* get
away with a force-move — but there's no reliable way to confirm nothing cached
it. Treat every push as final.

## Rule 2 — Layout the module for `cmd/`-style installs from day one

For any module that ships a CLI/binary intended for `go install`:

```
module-root/
  go.mod                    # module github.com/org/repo (or /vN for v2+)
  cmd/<binary-name>/
    main.go                 # package main — this determines the binary name
  internal/
    ...                     # implementation packages, not importable externally
```

Install command becomes:

```bash
go install github.com/org/repo/cmd/<binary-name>@latest
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

## Rule 3 — Major version bumps (v2, v3, ...) — sequence matters

When bumping to a new major version for the first time:

1. Update `go.mod`: `module github.com/org/repo/vN`
2. Update **every** internal import path in the repo to include `/vN`
3. Confirm layout follows Rule 2 (`cmd/<binary>/main.go` at the new import path)
4. Build and test **fully** locally:
   ```bash
   go build ./...
   go vet ./...
   ./gsa-lsp version
   ```
5. Commit
6. **Only then** tag:
   ```bash
   git tag vN.0.0
   ```
7. Push commit **and** tag, verify both landed:
   ```bash
   git push origin <branch>
   git push origin vN.0.0
   ```
8. Wait ~30s, then verify via the public proxy — see
   [Verifying via proxy.golang.org](#verifying-via-proxygolangorg) below.
9. Do a clean-room install test — see
   [Clean-room go install test](#clean-room-go-install-test) below.
10. Only after step 9 passes, update README/docs/goreleaser to point at the
    new install path.

## Rule 4 — If something's wrong after tagging, bump — never fix in place

Once `vX.Y.Z` is pushed:

- Bug in the tag? Cut `vX.Y.Z+1`, fix, tag, push. Never touch `vX.Y.Z` again.
- Docs stale? Fine to fix docs — but the **tag/binary content is frozen**.
- Mid-iteration fixing an install problem? Expect to burn 2-3 patch versions.
  That's normal and cheap. Abandoned tags cost nothing except a small gap in
  the version sequence.

## Rule 5 — goreleaser and CI config must mirror the install path exactly

Keep `.goreleaser.yml`'s `builds.main` and the release header's install
instructions in permanent sync:

```yaml
builds:
  - main: ./cmd/gsa-lsp
    binary: gsa-lsp

release:
  header: |
    go install github.com/padiazg/go-struct-analyzer/v2/cmd/gsa-lsp@{{ .Tag }}
```

If these drift (someone changes `main:` but forgets the header), the release
notes lie to users. Review this diff explicitly in every PR that touches
`.goreleaser.yml`.

## Rule 6 — Pre-flight checklist before every tag push

- [ ] `go build ./...` passes
- [ ] `go vet ./...` passes
- [ ] Binary runs and reports the right version: `./gsa-lsp version`
- [ ] `go.mod` module path matches the intended major version
- [ ] No uncommitted changes: `git status` is clean
- [ ] Tag name has never been used before: `git tag -l vX.Y.Z` locally **and**
      check the GitHub releases page — someone may have tagged manually there
- [ ] Push commit before push tag, confirm both are on the remote
- [ ] Verify via `proxy.golang.org` after ~30s (see below)
- [ ] Clean-room `go install` test before announcing the release (see below)

## Verifying via proxy.golang.org

Run this after pushing the tag. Replace the version with your actual tag:

```bash
curl -s https://proxy.golang.org/github.com/padiazg/go-struct-analyzer/v2/@v/v2.0.3.info
```

Expected response — confirm `Hash` matches your just-pushed commit:

```bash
# Get the commit the tag points to
git rev-parse v2.0.3
# e.g. fc68f1e40c27be6006decf02591edddf32f05120
```

```json
{
  "Version": "v2.0.3",
  "Time": "2026-07-23T23:47:02Z",
  "Origin": {
    "VCS": "git",
    "URL": "https://github.com/padiazg/go-struct-analyzer",
    "Hash": "fc68f1e40c27be6006decf02591edddf32f05120",
    "Ref": "refs/tags/v2.0.3"
  }
}
```

The `Hash` in the proxy response must match `git rev-parse <tag>`. If it
doesn't match, either the proxy hasn't indexed yet (wait, retry) or — worse —
this version string was already cached with different content from a previous
force-push. In the latter case, **abandon the tag and bump again**. Do not
investigate further; don't risk a poisoned version blocking users.

Also confirm `@latest` resolves to the new version once it should be the
newest:

```bash
curl -s https://proxy.golang.org/github.com/padiazg/go-struct-analyzer/v2/@latest
```

Expected response:

```json
{
  "Version": "v2.0.3",
  "Time": "2026-07-23T23:47:02Z",
  ...
}
```

If `@latest` still shows the previous version, the proxy may be behind. Wait
another 30-60s and retry. If it persists for several minutes, check that the
tag was actually pushed (`git ls-remote --tags origin vX.Y.Z`).

## Clean-room `go install` test

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

Why a fresh `GOBIN` and not your normal `$HOME/go/bin`: your local module
cache (`$(go env GOMODCACHE)`) may contain stale entries from earlier testing.
During the v2.0.0 migration, the local cache had `v2.0.0+incompatible` cached
from a failed `go install github.com/padiazg/go-struct-analyzer@v2.0.0`
attempt, which masked the real proxy error. A throwaway `GOBIN` with the
default `GOPROXY` (not `direct`, not `off`) bypasses all of that.

If this step fails, **do not announce the release**. Cut another patch tag,
push it, and repeat from step 8 of
[Rule 3](#rule-3--major-version-bumps-v2-v3--sequence-matters).
