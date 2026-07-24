# gsa-lsp Zed Extension

Adds struct memory layout, padding and fieldalignment analysis to Zed via `gsa-lsp`.

Runs alongside `gopls` — gopls handles navigation/completion, gsa-lsp adds layout analysis.

## Prerequisites

Install `gsa-lsp` binary:

```bash
go install github.com/padiazg/go-struct-analyzer/v2/cmd/gsa-lsp@latest
```

Or download from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

## Install Dev Extension

1. Open Zed command palette (`Ctrl/Cmd+Shift+P`)
2. Run `zed: install dev extension`
3. Select the `editors/zed/` directory from the `go-struct-analyzer` repo

Zed compiles the extension to WASM and activates it automatically.

## What You Get

- **Inlay hints** — shows struct total size at `type Foo struct` line, field offset/size/padding on each field line
- **Hover** — full struct memory layout breakdown (bytes, alignment, GC ptr bytes)
- **Diagnostics** — warnings when struct layout can be optimized or GC scan range reduced
- **Code actions** — "Reorder struct fields to optimize memory layout"

## Publishing

This extension is not yet published to `zed-industries/extensions`. The binary distribution strategy relies on `PATH` lookup via `worktree.which`.
