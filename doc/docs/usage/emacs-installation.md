# Emacs

> gsa-lsp speaks standard LSP using `textDocument/inlayHint`, `textDocument/hover`,
> `textDocument/publishDiagnostics`, and `textDocument/codeAction`. Emacs works great with
> either **eglot** (built-in for Emacs 29+) or **lsp-mode**.

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

No custom client code needed beyond registering the server.

## Installation

### 1. Install gsa-lsp binary

```bash
go install github.com/padiazg/go-struct-analyzer/lsp/cmd/gsa-lsp@latest
```

Or download a pre-built binary from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

### 2. Configure Emacs LSP client

#### eglot (Emacs 29+)

Add to your `~/.emacs.d/init.el`:

```elisp
(add-hook 'go-mode-hook
  (lambda ()
    (eglot-ensure)
    (setq-local eglot-workspace-configuration
      '(goStructAnalyzer
        (architecture . "amd64")
        (enableStructOptimizationWarnings . t)
        (enableReorderCodeAction . t)
        (enableGCPressureWarnings . t)))))
```

gsa-lsp starts automatically when you open a Go file. eglot handles inlay hints,
hover, diagnostics, and code actions out of the box.

#### lsp-mode

Add to your `~/.emacs.d/init.el`:

```elisp
(with-eval-after-load 'lsp-mode
  (lsp-register-client
    (make-lsp-client
      :new-connection (lsp-stdio-connection '("gsa-lsp" "lsp"))
      :major-modes '(go-mode)
      :server-id 'gsa-lsp
      :add-on t
      :multi-server t)))
```

`add-on: t` keeps gopls as the primary Go LSP server while gsa-lsp provides
supplemental struct analysis.

## Verifying

Open a Go file with struct types. You should see:

- **Inlay hints** showing struct total size after `type Foo struct` and field offset/size on each field
- **Hover** over a struct name for full memory layout
- **Diagnostics** in the flycheck/eglot panel for optimizable structs

## Troubleshooting

- **Inlay hints not showing:** eglot requires Emacs 30+ for native inlay hint support (Emacs 29
  needs `eglot-inlay-hints-mode` enabled explicitly). lsp-mode supports inlay hints on all
  Emacs versions.
- **Server not starting:** verify `gsa-lsp` is on your `$PATH` and executable.
