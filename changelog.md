# Change Log

All notable changes to the "go-struct-analyzer" extension will be documented in this file.

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