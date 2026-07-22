# Configuration

Open VS Code settings and search for "Go Struct Analyzer", or edit `settings.json` directly.

## All Settings

| Setting | Type | Default | Description |
| - | - | - | - |
| `goStructAnalyzer.showInlineAnnotations` | `boolean` | `true` | Show size annotations inline with struct fields |
| `goStructAnalyzer.showPadding` | `boolean` | `true` | Highlight padding bytes in struct layout visualization |
| `goStructAnalyzer.architecture` | `string` | `"amd64"` | Target architecture for calculations. One of: `amd64`, `386`, `arm64`, `arm` |
| `goStructAnalyzer.enableStructOptimizationWarnings` | `boolean` | `true` | Show warnings for structs that can be optimized for better memory layout |
| `goStructAnalyzer.enableReorderCodeAction` | `boolean` | `true` | Show quick fix to reorder struct fields for optimal memory layout |
| `goStructAnalyzer.reorderCodeActionPreferred` | `boolean` | `false` | Mark reorder quick fix as preferred — enables auto-apply with `source.fixAll`. Disabled by default to prevent accidental edits |
| `goStructAnalyzer.enableGCPressureWarnings` | `boolean` | `true` | Show hints for structs where reordering pointer fields would reduce the GC scan range |
| `goStructAnalyzer.gcPressureSeverityWarning` | `boolean` | `false` | Show GC pressure issues as warnings (yellow underline) instead of hints (blue underline). Requires `enableGCPressureWarnings` to be `true` |

## Architecture-dependent sizes

| Type | amd64/arm64 | 386/arm |
| - | - | - |
| pointer | 8 bytes | 4 bytes |
| `int`/`uint` | 8 bytes | 4 bytes |
| `uintptr` | 8 bytes | 4 bytes |
