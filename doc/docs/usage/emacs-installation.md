# Emacs

> gsa-lsp speaks standard LSP using `textDocument/inlayHint`, `textDocument/hover`,
> `textDocument/publishDiagnostics`, and `textDocument/codeAction`. Emacs works great with
> either **eglot** (built-in for Emacs 29+) or **lsp-mode**.

## How It Works

gsa-lsp is meant to run alongside `gopls` — gopls handles navigation/completion, gsa-lsp
provides struct layout analysis via **inlay hints**, **hover**, and **diagnostics**. Whether
both actually run at once depends on your client: **lsp-mode** supports multiple servers per
buffer natively (`:add-on t` below); plain **eglot** manages only one server per major mode at
a time, so running gsa-lsp and gopls together there requires `eglot-alternatives` (to pick one
per session) or a multiplexer — see the eglot section below.

| Feature | LSP method | What it shows |
| - | - | - |
| Struct size at definition | `textDocument/inlayHint` | Total struct size (and optimizable size if applicable) |
| Field offset/size/padding | `textDocument/inlayHint` | Per-field offset, byte size, and preceding padding |
| Full layout breakdown | `textDocument/hover` | Field-by-field memory layout with optimal layout alternative |
| Optimization warnings | `textDocument/publishDiagnostics` | Warnings when layout can be optimized or GC scan range reduced |
| Quick fix | `textDocument/codeAction` | "Reorder struct fields" code action on warning diagnostics |

No custom client code needed beyond registering the server.

## Init File Location

Before configuring, make sure you know which file Emacs is actually loading. Emacs resolves
its init file in a specific order, and editing the wrong file will silently have no effect.

Emacs tries these locations in order:

1. **`~/.emacs`** — a single-file init, tried first on non-Windows.
2. **`~/.emacs.d/init.el`** (or `~/.config/emacs/init.el` on systems using XDG) — an
   alternate location, only consulted if the primary file doesn't exist or fails to load.

**On Linux/macOS with `~/.emacs.d/`:** if `~/.emacs` exists, Emacs loads it and **never
looks at `~/.emacs.d/init.el`**. Changes to `init.el` are silently ignored.

**On systems using XDG (`~/.config/emacs/`):** only `init.el` is loaded; `~/.emacs` is
not consulted. No conflict.

**On Windows:** `~/.emacs` → `~/_emacs` → `~/.emacs.d/init.el`. Same chain with an
additional legacy fallback.

Emacs 30+ adds the `--init-directory DIR` flag to skip all auto-detection and use
`DIR/init.el` directly.

Check which file your Emacs loaded:

```
M-x describe-variable RET user-init-file RET
```

or, in Lisp:

```elisp
(princ user-init-file)
```

If the output points to the wrong file, either delete it or move your config to the file
that is actually being loaded.

## Installation

### 1. Install gsa-lsp binary

```bash
go install github.com/padiazg/go-struct-analyzer/v2/lsp@latest
```

Or download a pre-built binary from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

### 2. Install the Tree-Sitter Go grammar

Emacs 30 uses Tree-Sitter for Go code editing via `go-ts-mode`. The LSP setup below
depends on it, so the grammar must be present before opening `.go` files.

**One-shot manual install** (run once):

```
M-x treesit-install-language-grammar RET go RET
```

**Or auto-install on every Emacs start** (add to your config):

```elisp
(unless (treesit-ready-p 'go)
  (treesit-install-language-grammar 'go))
```

You can also pre-register the grammar source URL so Emacs knows where to fetch it:

```elisp
(setq treesit-language-source-alist
      '((go "https://github.com/tree-sitter/tree-sitter-go")))
```

Without this, Emacs prompts for the repository URL interactively — a poor experience
for users who just want things to work out of the box.

### 3. Configure Emacs LSP client

#### eglot (Emacs 29+)

gsa-lsp isn't one of eglot's built-in servers, so register it in
`eglot-server-programs`. Pass settings via `:initializationOptions` — this is
the simplest way to configure gsa-lsp and works on any Emacs 29+ install:

```elisp
;; 1. Require go-ts-mode so its side-effects run.
;;
;; go-ts-mode.el registers .go → go-ts-mode in auto-mode-alist and adds
;; go-ts-mode as a derived mode from go-mode via derived-mode-add-parents.
;; These are plain top-level forms, not autoloaded. Referencing the bare
;; symbol go-ts-mode in hooks or major-mode-remap-alist does NOT load the
;; file. You must call (require 'go-ts-mode) explicitly.
(require 'go-ts-mode)

;; 2. Register gsa-lsp as the server for go-mode.
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
    `(go-mode . ("gsa-lsp" "lsp" :initializationOptions
                 (:architecture "amd64"
                  :gcPressureSeverityWarning :json-false
                  :enableStructOptimizationWarnings t
                  :enableReorderCodeAction t
                  :enableGCPressureWarnings t)))))

;; 3. Start eglot when go-ts-mode buffers open.
(add-hook 'go-ts-mode-hook 'eglot-ensure)
```

gsa-lsp starts automatically when you open a Go file. eglot handles inlay hints,
hover, diagnostics, and code actions out of the box.

Note `eglot-server-programs` associates one server per major mode — if you
also run `gopls` for `go-mode` via eglot, use
[`eglot-alternatives`](https://joaotavora.github.io/eglot/#Setting-Up-LSP-Servers)
or `lsp-mode` (below), which supports running several servers side by side
more directly.

##### Changing settings without restarting (advanced)

To tweak settings live, in the same Emacs session, use
`eglot-workspace-configuration` instead. Its value is a plist keyed by
server/section name (`:goStructAnalyzer` here), set directory-locally (e.g.
in a `.dir-locals.el` at the project root):

```elisp
((go-mode
  . ((eglot-workspace-configuration
      . (:goStructAnalyzer
         (:architecture "amd64"
          :enableStructOptimizationWarnings t
          :enableReorderCodeAction t
          :enableGCPressureWarnings t))))))
```

This value is sent to the server when the connection is established, and any
time you run `M-x eglot-signal-didChangeConfiguration` afterwards — gsa-lsp
re-analyzes open buffers immediately when settings change, no restart needed.

#### lsp-mode

Add to your Emacs init file (the path depends on your setup — see
[Init File Location](#init-file-location) above):

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

### 4. Clean organization (optional)

For larger configs, consider splitting hand-written code from Custom-generated
settings into separate files, then loading them from a thin `~/.emacs` manifest.
This is **optional** — it won't change how gsa-lsp works, but keeps your config
maintainable as it grows.

```elisp
;;; ~/.emacs — thin manifest
;;; -*- lexical-binding: t -*-

;; 1. Store custom-set-variables/face blocks in their own file
(setq custom-file (locate-user-emacs-file "custom.el"))
(load custom-file 'noerror)

;; 2. Add ~/.emacs.d/ to load-path so (require 'foo) finds sub-modules
(add-to-list 'load-path (locate-user-emacs-file "."))

;; 3. Load domain-specific sub-modules
(require 'gsa-lsp)
```

```elisp
;;; ~/.emacs.d/custom.el — auto-generated by M-x customize
;;; -*- lexical-binding: t -*-
(custom-set-variables
 '(package-selected-packages '(eglot)))
(custom-set-faces)
```

```elisp
;;; ~/.emacs.d/gsa-lsp.el — hand-written gsa-lsp config
;;; -*- lexical-binding: t -*-
(require 'go-ts-mode)
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
    `(go-mode . ("gsa-lsp" "lsp" :initializationOptions
                 (:architecture "amd64"
                  :gcPressureSeverityWarning :json-false
                  :enableStructOptimizationWarnings t
                  :enableReorderCodeAction t
                  :enableGCPressureWarnings t)))))
(add-hook 'go-ts-mode-hook 'eglot-ensure)
(provide 'gsa-lsp)
```

## Verifying

Open a Go file with struct types. Confirm the following:

1. **Major mode is `go-ts-mode`** (not `fundamental-mode`). Check with:
   ```
   M-x describe-variable RET major-mode RET
   ```
   It should say `go-ts-mode`. If it says `fundamental-mode`, your init file
   isn't loading properly — see [Troubleshooting](#troubleshooting) below.

2. **Mode-line shows `[gsa-lsp]`** after opening the file. eglot connects
   asynchronously; it may take a second for the indicator to appear.

3. **Inlay hints** show struct total size after `type Foo struct` and field
   offset/size on each field.

4. **Hover** over a struct name for full memory layout.

5. **Diagnostics** appear for optimizable structs (misaligned padding).

## Troubleshooting

- **Inlay hints not showing:** eglot requires Emacs 30+ for native inlay hint
  support (Emacs 29 needs `eglot-inlay-hints-mode` enabled explicitly).
  lsp-mode supports inlay hints on all Emacs versions.

- **Server not starting:** verify `gsa-lsp` is on your `$PATH` and executable
  (`which gsa-lsp`).

- **Go files open in Fundamental mode:**
  - Tree-Sitter Go grammar is not installed. Run
    `M-x treesit-install-language-grammar RET go RET`.
  - Your init file is wrong. `~/.emacs` takes precedence over
    `~/.emacs.d/init.el` on Linux/macOS/Windows (see [Init File Location](#init-file-location)).
    Check `M-x describe-variable RET user-init-file RET` to confirm.

- **gsa-lsp doesn't start after opening a .go file:**
  - The hook is on `go-mode-hook` but the active mode is `go-ts-mode`.
    Change to `(add-hook 'go-ts-mode-hook 'eglot-ensure)`.
  - `(require 'go-ts-mode)` is missing from your config. Without it,
    `go-ts-mode.el` never loads, so the `.go` → `go-ts-mode` auto-mode
    registration never happens.

- **My edits to init.el have no effect:**
  You may be editing `~/.emacs.d/init.el` but Emacs loaded `~/.emacs` first
  (same issue as above). Either delete the shadowing file or edit the
  correct one — use `C-h v user-init-file RET` to confirm which is active.

- **`gsa-lsp` binary not found:** Ensure `go install ...` succeeded and
  `$GOPATH/bin` or `$HOME/go/bin` is in your `$PATH`, or download the
  pre-built binary from GitHub Releases and place it on your `$PATH`.
