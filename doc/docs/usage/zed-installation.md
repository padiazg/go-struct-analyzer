# Zed Editor

> gsa-lsp also supports any LSP-compatible editor via standard `textDocument/inlayHint`,
> `textDocument/hover`, and `textDocument/publishDiagnostics`. Zed support is documented here
> as the reference implementation for non-VS Code editors.

## How It Works

gsa-lsp runs alongside `gopls` — gopls handles navigation/completion, gsa-lsp provides struct
layout analysis via **inlay hints**, **hover**, and **diagnostics**.

| Feature | LSP method | What it shows |
| - | - | - |
| Struct size at definition | `textDocument/inlayHint` | Total struct size (and optimizable size if applicable) |
| Field offset/size/padding | `textDocument/inlayHint` | Per-field offset, byte size, and preceding padding |
| Full layout breakdown | `textDocument/hover` | Field-by-field memory layout with optimal layout alternative |
| Optimization warnings | `textDocument/publishDiagnostics` | Warnings when layout can be optimized or GC scan range reduced |
| Quick fix | `textDocument/codeAction` | "Reorder struct fields" code action on warning diagnostics |

No custom client code needed — any editor that supports these standard LSP capabilities will work.

## Installation

### 1. Install gsa-lsp binary

```bash
go install github.com/padiazg/go-struct-analyzer/v2/lsp@latest
```

Or download a pre-built binary from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

### 2. Install Zed extension

1. Open Zed command palette (`Ctrl/Cmd+Shift+P`)
2. Run `zed: install dev extension`
3. Select the `editors/zed/` directory from the `go-struct-analyzer` repo

Zed compiles the extension WASM and activates it automatically. gsa-lsp starts alongside gopls
when you open a Go file.

## Verifying

Open a Go file with struct types. You should see:

- **Inlay hints** showing struct total size after `type Foo struct` and field offset/size on each field
- **Hover** over a struct name for full memory layout
- **Diagnostics** in the bottom panel for optimizable structs
