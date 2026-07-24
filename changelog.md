# Change Log

All notable changes to the "go-struct-analyzer" extension will be documented in this file.

## [2.0.3] - 2026-07-24

> Versions v2.0.0, v2.0.1 and v2.0.2 were skipped due to tag immutability issues
> with the Go module proxy during migration. See [RELEASING.md](RELEASING.md)
> for the postmortem.

### Added

- **Go LSP backend**: Analysis engine rewritten in Go using `go/types` for exact `fieldalignment` parity. Named interfaces (`logger.Logger`) now correctly sized at 16B instead of 8B.
- **Documentation**: Full documentation site (MkDocs + Material theme) covering installation, usage, concepts, and development.
- **gsa-lsp CLI**: Standalone binary shipping with the extension. `gsa-lsp analyze [--arch] file.go` for CLI analysis, `gsa-lsp lsp` for LSP server.
- **Custom LSP method `$/structData`**: Enables VS Code inline annotations (size-after-field, padding highlight) by requesting raw struct analysis from the Go server.
- **Cross-file struct resolution**: Go backend uses `go/packages`, resolves structs from imported packages and multi-file packages. No longer limited to the current file.
- **`.goreleaser.yml`**: linux+darwin, amd64+arm64 binary releases via GoReleaser.

### Changed

- **VS Code extension**: Refactored from pure TypeScript to LSP client via `vscode-languageclient/node` v10. All hover, diagnostics, codeLens, and codeAction features now backed by the Go LSP server.
- **Build system**: Makefile added (`make build`, `make test`, `make preflight`). Go toolchain required alongside Node.js.
- **Architecture accuracy**: Size, alignment, and ptrdata now computed by `go/types.SizesFor()`, exactly matching the Go compiler and `fieldalignment`.
- **Inline annotations**: Rewritten to request data from the Go server via `$/structData` custom request, then apply VS Code decorations accordingly.
- **Updated CI runtime**: Node.js version bumped from 20 to 22 (LTS) across all workflow files; build matrix expanded to `[22.x, 24.x]`. `@types/node` devDependency updated to 22.x.
- **Added Dependabot**: Automatic weekly PRs for npm and GitHub Actions dependency updates.

### Removed

- **TypeScript analyzer**: `parser.ts`, `analyzer.ts`, `hover.ts`, `codelens.ts`, `diagnostics.ts`, `codeaction.ts` removed. Replaced by `internal/` Go module.

## Previous Versions

**v1.x release history**: The old TS-based engine is discarded.

### [1.2.0] - 2026-04-20

#### Added

- **GC Pressure Warnings**: New hints (blue underline) on structs where reordering pointer fields would reduce the GC scan range — the number of bytes the garbage collector must scan for pointers
- **GC-Optimal Quick Fix**: New code action "Reorder struct fields to reduce GC scan range" alongside the existing size-optimization fix
- **GC-Optimal Layout in side panel**: The "Analyze Struct Layout" panel now shows up to three columns — Current, Size-Optimal, and GC-Optimal — each with a "GC scan: X bytes" footer
- **GC info in code lens**: Inline annotation now includes GC scan range when applicable (e.g. `48 bytes total · GC scan 40→32B`)
- **Two-pass struct resolution**: The analyzer now resolves the real size and alignment of named/embedded struct types defined in the same file, enabling accurate analysis of structs that embed other structs
- **Recursive pointer classification**: Embedded struct types are now correctly classified as pointer-containing or not, fixing incorrect GC-optimal ordering when an embedded struct has no pointer fields
- New settings: `enableGCPressureWarnings`, `gcPressureSeverityWarning`

#### Fixed

- Quick fix is now offered for structs that contain embedded (anonymous) fields alongside regular named fields
- Embedded struct fields with no pointer content (e.g. `{ID uint64; CreatedAt int64}`) are no longer incorrectly treated as pointer-containing when computing GC-optimal field order

### [1.0.0] - 2025-05-30

#### Added

- Initial release
- Hover information showing field size, alignment, offset, and padding
- Inline code lens annotations for struct and field sizes
- Memory layout visualization command
- Support for multiple architectures (amd64, 386, arm64, arm)
- Configuration options for display preferences
- Support for all Go basic types, pointers, slices, arrays, maps, channels, and interfaces

#### Features

- Detailed struct memory layout analysis
- Padding detection and visualization
- Architecture-specific size calculations
- Real-time size information while coding

## License

MIT — see LICENSE for details.
