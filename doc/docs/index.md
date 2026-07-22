# Go Struct Analyzer — v2.0.0

**Go Struct Analyzer** shows memory size and padding information for Go structs, powered by a **Go LSP backend** (`gsa-lsp`) for exact `fieldalignment` parity.

Available for **VS Code** (extension) and **Zed** (dev extension). Works with any LSP-compatible editor via standard LSP protocol.

> **v2.0.0**: Analysis engine rewritten in Go using `go/types`. Named interfaces correctly sized at 16B instead of 8B. Matches `fieldalignment` exactly.

## What It Does

- Hover over any struct field to see size, alignment, offset, and padding
- Code lens annotations showing struct and field sizes inline
- Real-time warnings when structs waste memory due to padding
- GC pressure hints when pointer field reordering would reduce garbage collector scan range
- One-click quick fix to reorder fields for optimal layout
- Side panel with current and optimal layouts side by side
- Architecture-aware calculations (amd64, 386, arm64, arm)

## Quick Install

**VS Code:**
[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/PatricioDiaz.go-struct-analyzer.svg)](https://marketplace.visualstudio.com/items?itemName=PatricioDiaz.go-struct-analyzer)

```shell
code --install-extension PatricioDiaz.go-struct-analyzer
```

**Zed:** See [Zed installation guide](usage/zed-installation.md).

**Any LSP editor:** Point your LSP client to the `gsa-lsp` binary (`go install github.com/padiazg/go-struct-analyzer/lsp/cmd/gsa-lsp@latest`). gsa-lsp speaks standard inlayHint, hover, diagnostics, and codeAction.

## Quick Start

Open any Go file in VS Code. Hover over a struct or its fields to see size details. Structs that can be optimized are underlined with a warning — click the lightbulb or press `Ctrl+.` to reorder fields.

```go
type Event struct {         // ⚠️ 40 bytes (can be 24 bytes)
    A bool
    B int64
    C bool
    D int64
    E int32
    F bool
}
```

→ [Full Quick Start](getting-started/quickstart.md)

## Configuration

| Setting | Default | Description |
| - | - | - |
| `goStructAnalyzer.showInlineAnnotations` | `true` | Show size annotations inline with struct fields |
| `goStructAnalyzer.showPadding` | `true` | Highlight padding bytes in struct layout |
| `goStructAnalyzer.architecture` | `amd64` | Target architecture: `amd64`, `386`, `arm64`, `arm` |
| `goStructAnalyzer.enableStructOptimizationWarnings` | `true` | Show warnings for sub-optimal memory layout |
| `goStructAnalyzer.enableReorderCodeAction` | `true` | Show quick fix to reorder struct fields |
| `goStructAnalyzer.reorderCodeActionPreferred` | `false` | Mark reorder as preferred fix for `source.fixAll` |
| `goStructAnalyzer.enableGCPressureWarnings` | `true` | Show hints for reducing GC scan range |
| `goStructAnalyzer.gcPressureSeverityWarning` | `false` | Promote GC hints to warnings (yellow underline) |

→ [Full Configuration](usage/configuration.md)

## Resources

- [Installation Guide](getting-started/installation.md) — all install methods
- [Usage Documentation](usage/index.md) — detailed feature walkthroughs
- [Concepts](concepts/index.md) — memory alignment, GC scan, ptrdata
- [Development Guide](../CONTRIBUTING.md) — contributing and building
- [Changelog](changelog.md) — version history
- [License](license.md) — MIT
