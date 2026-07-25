# Go Struct Analyzer — Development Guide

Developer documentation and contributor guide for the Go Struct Analyzer VS Code extension.

## Prerequisites

- **Go** 1.21+ (for the LSP server)
- **Node.js** 22+ (for the VS Code extension)
- **VS Code** (for extension development)

## Quick Start

```bash
git clone https://github.com/padiazg/go-struct-analyzer
cd go-struct-analyzer
make build
```

Press **F5** in VS Code to launch an Extension Development Host window with the extension loaded.

## Project Structure

| Directory/File | Purpose |
| - | - |
| `cmd/gsa-lsp/` | CLI entry point (`analyze`, `lsp`, `version` subcommands) |
| `internal/analysis/` | Types, layout (size/align/ptrdata), analyzer (`go/packages`), optimizer (`fieldalignment` sort) |
| `internal/lsp/` | Protocol types, JSON-RPC server, all LSP method handlers |
| `internal/version/` | Ldflags version variables |
| `src/extension.ts` | VS Code extension entry — LSP client + inline annotations |
| `Makefile` | Build, test, lint, preflight targets |
| `test_go_file.go` | Validation structs (BadLayout, GoodLayout, ComplexStruct, ArrayExample) |
| `test_go_edge-cases.go` | Edge cases (generics, embedded, tags, comments, composite types) |

## Development Workflow

### Build

```bash
make build        # Go binary + TypeScript (full build)
make build-go     # gsa-lsp binary only
make build-ts     # TypeScript only
```

### Test

```bash
make test         # Go tests with race detector
make coverage     # Go tests + coverage report
```

### Lint and Format

```bash
make lint         # golangci-lint (Go)
make vet          # go vet (Go)
make fmt          # gofmt (Go)
make preflight    # vet → fmt → lint → test
```

### Run the LSP Server

```bash
make build-go
./gsa-lsp analyze test_go_file.go          # CLI analysis (JSON)
echo '...' | ./gsa-lsp lsp                 # LSP mode (stdin/stdout)
```

### VS Code Extension Development

1. `make build` — compile everything
2. Press `F5` in VS Code to launch Extension Development Host
3. Open any `.go` file to see features in action
4. Check **Output** panel (View → Output, select "Go Struct Analyzer") for LSP logs

Changes to `src/extension.ts` require a rebuild (`make build-ts`) and reload of the Extension Development Host.

Changes to `internal/` Go code require `make build-go` (or `make build`) and reload.

## Go Module

The Go code lives under `cmd/gsa-lsp/` and `internal/`:

```bash
go test -race -count=1 ./...
go vet ./...
golangci-lint run ./...
```

### LSP Server Architecture

- **JSON-RPC 2.0** over stdin/stdout with Content-Length headers
- File analysis triggers on `didOpen` / `didSave`
- Supports: `initialize`, `shutdown`, `textDocument/hover`, `textDocument/codeLens`, `textDocument/codeAction`, `textDocument/didOpen/didChange/didSave/didClose`, `textDocument/publishDiagnostics`, `$/structData`
- The `$/structData` custom request returns the raw `AnalysisResult` for inline annotations

## Validation

### Against fieldalignment

The Go backend uses `go/types.SizesFor()` and a `ptrdata()` algorithm matching `gcSizes.ptrdata()`:

```bash
# Verify sizing
./gsa-lsp analyze test_go_file.go | python3 -m json.tool

# Compare against go-crap structs
./gsa-lsp analyze /path/to/go-crap/internal/coverage/scanner.go
```

Known correct values:
- `Scanner` struct: 40 bytes → 32 bytes (matches fieldalignment "40 ptr bytes → 32")
- `Options` struct: 80 bytes → 72 bytes (matches fieldalignment "80 ptr bytes → 72")

### Manual VS Code Validation

- [ ] Open `test_go_file.go` in Extension Development Host
- [ ] Hover over each struct — verify sizes match `./gsa-lsp analyze test_go_file.go`
- [ ] Code lens shows correct sizes
- [ ] Diagnostics fire for sub-optimal structs (BadLayout, not GoodLayout)
- [ ] Quick fix offered for BadLayout, not for GoodLayout
- [ ] Tags, comments, indentation preserved after reorder
- [ ] `$/structData` provides correct data (inline annotations render)

## Architecture Notes

### Go Memory Alignment

1. Each field aligns to its natural boundary (size, capped at pointer size)
2. Struct alignment is the largest field alignment
3. Struct size is padded to a multiple of its alignment

### Architecture-Dependent Sizes

| Type | amd64/arm64 | 386/arm |
| - | - | - |
| pointer | 8 bytes | 4 bytes |
| `int`/`uint` | 8 bytes | 4 bytes |
| `uintptr` | 8 bytes | 4 bytes |

### GC Pointer Types

These contain pointers and affect GC scan range:

- `*T` (pointers)
- `string` (data pointer)
- `[]T` (slice header pointer)
- `map[K]V` (map header pointer)
- `chan T` (channel header pointer)
- `func(...)` (function pointer)
- `interface{}` / named interfaces (two pointers: type + data)

### Field Reorder Sort Order

Matches `fieldalignment` exactly:

1. Zero-sized fields first
2. Descending alignment
3. Pointer-bearing before pointer-free (same alignment)
4. Trailing non-pointer: ascending size then ascending name
5. Trailing pointer: ascending size then ascending name

## Adding New Features

- **New LSP method**: add handler in `internal/lsp/handler.go`, register in `server.go`'s `handleRequest` switch
- **New analysis capability**: extend `internal/analysis/` — types, layout, analyzer
- **New VS Code feature**: if LSP-providable, add to language server; otherwise add to `src/extension.ts`
- **New setting**: add to `package.json` → `contributes.configuration.properties`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes following code style
4. Run `make preflight` (vet → fmt → lint → test)
5. Validate against test Go files
6. Submit a PR with clear description of what, why, and testing performed

### PR Checklist

- [ ] Code follows style guidelines
- [ ] `make preflight` passes
- [ ] Manual testing done in Extension Development Host
- [ ] Validated against `test_go_file.go` and `test_go_edge-cases.go`
- [ ] No debug output left in production code
- [ ] `package.json` version unchanged (maintainer handles versions)

## Zed Extension

An experimental Zed extension lives at [`editors/zed/`](https://github.com/padiazg/go-struct-analyzer/tree/main/editors/zed/). Install as a dev extension:

1. `zed: install dev extension` → point to `editors/zed/`
2. `gsa-lsp` must be on `PATH` (`make install`)

The extension registers `gsa-lsp` as an additional language server for Go, running alongside `gopls`. See [`editors/zed/README.md`](https://github.com/padiazg/go-struct-analyzer/blob/main/editors/zed/README.md).

## Version and Release

Semver increment guide for PR authors:

- **Patch** (2.0.3 → 2.0.4): Bug fixes, doc updates
- **Minor** (2.0.3 → 2.1.0): New features, backward-compatible
- **Major** (2.0.3 → 3.0.0): Breaking changes

## Building for Local Installation

```bash
make build
npx vsce package
```

Generates a `.vsix` file installable via VS Code's "Install from VSIX" option.

## Questions?

Open an issue at https://github.com/padiazg/go-struct-analyzer/issues
