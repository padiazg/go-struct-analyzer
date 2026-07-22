# Changelog

All notable changes to the Go Struct Analyzer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-21

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

### Removed

- **TypeScript analyzer**: `parser.ts`, `analyzer.ts`, `hover.ts`, `codelens.ts`, `diagnostics.ts`, `codeaction.ts` removed. Replaced by `lsp/` Go module.
- **v1.x release history**: The old TS-based engine is discarded. All earlier changelog entries removed to reflect the clean break.

## Previous Versions

### [1.3.0] - 2026-07-21

#### Added

- **Standard library type seeding**: Pre-seeded exact sizes and GC pointer data for common stdlib types — `time.Time` (24B), `reflect.Value` (24B), `reflect.Type` (16B), `token.Position` (40B). These no longer fall through to opaque pointer-sized estimates, improving layout analysis accuracy for structs referencing them.

#### Changed

- **Precise ptrdata calculation**: Replaced coarse `getPointerClass()` (ternary `pure`/`mixed`/`none`) with `getPtrData()` returning the exact GC scan byte range (`gcSizes.ptrdata()` semantics from `fieldalignment`/`go/analysis`). Arrays now compute `(N-1) * elemSize + elemPtrData` instead of collapsing to `mixed`. Embedded registered structs compute byte-accurate ptrdata through their fields rather than binary pointer-class inheritance.
- **Updated CI runtime**: Node.js version bumped from 20 to 22 (LTS) across all workflow files; build matrix expanded to `[22.x, 24.x]`. `@types/node` devDependency updated to 22.x.
- **Added Dependabot**: Automatic weekly PRs for npm and GitHub Actions dependency updates.

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
