# Change Log

All notable changes to the "go-struct-analyzer" extension will be documented in this file.

## [1.3.0] - 2026-07-21

### Added

- **Standard library type seeding**: Pre-seeded exact sizes and GC pointer data for common stdlib types — `time.Time` (24B), `reflect.Value` (24B), `reflect.Type` (16B), `token.Position` (40B). These no longer fall through to opaque pointer-sized estimates, improving layout analysis accuracy for structs referencing them.

### Changed

- **Precise ptrdata calculation**: Replaced coarse `getPointerClass()` (ternary `pure`/`mixed`/`none`) with `getPtrData()` returning the exact GC scan byte range (`gcSizes.ptrdata()` semantics from `fieldalignment`/`go/analysis`). Arrays now compute `(N-1) * elemSize + elemPtrData` instead of collapsing to `mixed`. Embedded registered structs compute byte-accurate ptrdata through their fields rather than binary pointer-class inheritance.
- **Updated CI runtime**: Node.js version bumped from 20 to 22 (LTS) across all workflow files; build matrix expanded to `[22.x, 24.x]`. `@types/node` devDependency updated to 22.x.
- **Added Dependabot**: Automatic weekly PRs for npm and GitHub Actions dependency updates.

## [1.2.0] - 2026-04-20

### Added

- **GC Pressure Warnings**: New hints (blue underline) on structs where reordering pointer fields would reduce the GC scan range — the number of bytes the garbage collector must scan for pointers
- **GC-Optimal Quick Fix**: New code action "Reorder struct fields to reduce GC scan range" alongside the existing size-optimization fix
- **GC-Optimal Layout in side panel**: The "Analyze Struct Layout" panel now shows up to three columns — Current, Size-Optimal, and GC-Optimal — each with a "GC scan: X bytes" footer
- **GC info in code lens**: Inline annotation now includes GC scan range when applicable (e.g. `48 bytes total · GC scan 40→32B`)
- **Two-pass struct resolution**: The analyzer now resolves the real size and alignment of named/embedded struct types defined in the same file, enabling accurate analysis of structs that embed other structs
- **Recursive pointer classification**: Embedded struct types are now correctly classified as pointer-containing or not, fixing incorrect GC-optimal ordering when an embedded struct has no pointer fields
- New settings: `enableGCPressureWarnings`, `gcPressureSeverityWarning`

### Fixed

- Quick fix is now offered for structs that contain embedded (anonymous) fields alongside regular named fields
- Embedded struct fields with no pointer content (e.g. `{ID uint64; CreatedAt int64}`) are no longer incorrectly treated as pointer-containing when computing GC-optimal field order

## [1.0.0] - 2025-05-30

### Added

- Initial release
- Hover information showing field size, alignment, offset, and padding
- Inline code lens annotations for struct and field sizes
- Memory layout visualization command
- Support for multiple architectures (amd64, 386, arm64, arm)
- Configuration options for display preferences
- Support for all Go basic types, pointers, slices, arrays, maps, channels, and interfaces

### Features

- Detailed struct memory layout analysis
- Padding detection and visualization
- Architecture-specific size calculations
- Real-time size information while coding
