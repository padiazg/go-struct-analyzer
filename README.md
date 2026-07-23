# Go Struct Analyzer — v2.0.0

A VS Code extension that shows memory size and padding information for Go structs, now powered by a **Go LSP backend** for exact `fieldalignment` parity.

> **v2.0.0**: Analysis engine rewritten in Go using `go/types`. Named interfaces (`logger.Logger`) correctly sized at 16B instead of 8B. Matches `fieldalignment` exactly.

## Features

- **Hover Information** — hover over struct fields to see size, alignment, offset, and padding
- **Inline Annotations** — code lens showing struct/field sizes and GC scan info directly in the editor
- **Optimization Warnings** — real-time yellow underline when struct layout wastes memory
- **GC Pressure Hints** — blue underline when pointer field reordering reduces GC scan range
- **Quick Fix** — one-click reorder for memory layout and GC pressure issues (preserves tags, comments, indentation)
- **Side Panel** — side-by-side Current and Optimal layouts
- **Architecture Support** — configurable target (amd64, 386, arm64, arm)

## Quick Install

[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/PatricioDiaz.go-struct-analyzer.svg)](https://marketplace.visualstudio.com/items?itemName=PatricioDiaz.go-struct-analyzer)
[![Open VSX](https://img.shields.io/open-vsx/v/PatricioDiaz/go-struct-analyzer)](https://open-vsx.org/extension/PatricioDiaz/go-struct-analyzer)

```bash
code --install-extension PatricioDiaz.go-struct-analyzer
```

### Install from VSIX (VS Code / Cursor)

Download the `.vsix` from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases):

```bash
code --install-extension go-struct-analyzer-*.vsix
```

Cursor: Extensions → "..." → Install from VSIX.

## Quick Start

Open any Go file. Hover over a struct field to see its layout. When a struct shows a yellow warning, click the lightbulb or press `Ctrl+.` to reorder fields for optimal size:

```go
type Event struct {         // ⚠️ 40 bytes (can be 24 bytes)
    A bool     // 1B
    B int64    // 8B (+7B padding)
    C bool     // 1B
    D int64    // 8B (+7B padding)
    E int32    // 4B
    F bool     // 1B (+3B padding)
}
```

After quick fix:

```go
type Event struct {         // ✓ 24 bytes, -16B
    B int64    // 8B
    D int64    // 8B
    E int32    // 4B
    A bool     // 1B
    C bool     // 1B
    F bool     // 1B (+1B padding)
}
```

## gsa-lsp CLI Tool

The extension ships `gsa-lsp` — a standalone Go binary for struct analysis outside VS Code:

```bash
gsa-lsp analyze [--arch amd64] file.go     # JSON output
gsa-lsp lsp                                 # LSP server (stdin/stdout)
gsa-lsp version                             # version info
```

Install from source:

```bash
make build-go                               # builds gsa-lsp to project root
make install                                # copies to $GOPATH/bin
```

Install via `go install`:

```bash
go install github.com/padiazg/go-struct-analyzer/v2/lsp@latest
```

### LSP Server for Other Editors

`gsa-lsp` is a standard LSP server — use it with any LSP-compatible editor alongside `gopls`:

```bash
gsa-lsp lsp                                 # stdin/stdout JSON-RPC
```

Supported LSP methods: `textDocument/hover`, `textDocument/codeLens`, `textDocument/codeAction`, `textDocument/publishDiagnostics`.

**Emacs:** see the [Emacs setup guide](doc/docs/usage/emacs-installation.md) for eglot (Emacs 29+) and lsp-mode.

**Neovim:** see the [Neovim setup guide](doc/docs/usage/neovim-installation.md) for built-in LSP client config.

**Helix** (`~/.config/helix/languages.toml`):

```toml
[language-server.gsa-lsp]
command = "gsa-lsp"
args = ["lsp"]

[[language]]
name = "go"
language-servers = ["gsa-lsp"]
```

**Zed** (experimental): install the dev extension from [`editors/zed/`](editors/zed/) via `zed: install dev extension`. See [`editors/zed/README.md`](editors/zed/README.md). The binary must be on `PATH`.

> Best experience is the VS Code extension (inline annotations, side panel). Other editors get hover info, diagnostics, and code actions only.

## Configuration

| Setting | Default | Description |
| - | - | - |
| `showInlineAnnotations` | `false` | Show size annotations inline |
| `showPadding` | `true` | Highlight padding bytes |
| `architecture` | `amd64` | Target architecture |
| `enableStructOptimizationWarnings` | `true` | Warnings for sub-optimal layout |
| `enableReorderCodeAction` | `true` | Quick fix for field reorder |
| `reorderCodeActionPreferred` | `false` | Enable `source.fixAll` |
| `enableGCPressureWarnings` | `true` | GC scan range hints |
| `gcPressureSeverityWarning` | `false` | GC hints as warnings (yellow underline) instead of hints (...) |

All settings are prefixed with `goStructAnalyzer.` (e.g. `goStructAnalyzer.architecture`).

## Documentation

- [Full user documentation](doc/docs/index.md) — detailed guides for all features
- [Configuration](doc/docs/usage/configuration.md) — all settings reference
- [Memory alignment concepts](doc/docs/concepts/memory-alignment.md) — how Go struct alignment works
- [GC scan range](doc/docs/concepts/gc-scan.md) — understanding GC pressure

## Build from Source

```bash
git clone https://github.com/padiazg/go-struct-analyzer
cd go-struct-analyzer
make build                                    # Go binary + TypeScript
# or:  make build-go                          # Go binary only
# or:  make build-ts                          # TypeScript only
```

Prerequisites: Go 1.21+, Node.js 22+

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project structure, coding guidelines, and PR process.

## Changelog

See [changelog.md](changelog.md) for version history.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- [fieldalignment](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/fieldalignment) — the GC pointer scan range concept that inspired the GC pressure analysis.
