# Neovim

> gsa-lsp speaks standard LSP using `textDocument/inlayHint`, `textDocument/hover`,
> `textDocument/publishDiagnostics`, and `textDocument/codeAction`. Neovim's built-in
> LSP client handles all of these natively.

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

No plugins needed — Neovim's built-in LTP client supports all required methods.

## Installation

### 1. Install gsa-lsp binary

```bash
go install github.com/padiazg/go-struct-analyzer/lsp/cmd/gsa-lsp@latest
```

Or download a pre-built binary from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

### 2. Configure Neovim LSP

Add to your Neovim config (e.g. `~/.config/nvim/init.lua`):

```lua
vim.api.nvim_create_autocmd('FileType', {
  pattern = 'go',
  callback = function()
    vim.lsp.start({
      name = 'gsa-lsp',
      cmd = { 'gsa-lsp', 'lsp' },
      init_options = {
        architecture = 'amd64',
        enableStructOptimizationWarnings = true,
        enableReorderCodeAction = true,
        enableGCPressureWarnings = true,
      },
    })
  end,
})
```

gsa-lsp starts alongside gopls when you open a Go file. Neovim displays inlay hints,
hover information, diagnostics, and code actions automatically.

### Using with gopls

If you already have gopls configured, gsa-lsp works as a secondary server — both
run concurrently. gopls provides navigation, completion, and refactoring while
gsa-lsp provides struct layout analysis.

### Using with lsp-zero / lazy.nvim

```lua
{
  "neovim/nvim-lspconfig",
  opts = {
    servers = {
      gsa_lsp = {
        cmd = { "gsa-lsp", "lsp" },
        init_options = {
          architecture = "amd64",
        },
      },
    },
  },
}
```

## Verifying

Open a Go file with struct types. You should see:

- **Inlay hints** showing struct total size after `type Foo struct` and field offset/size on each field
- **Hover** over a struct name (`K` by default) for full memory layout
- **Diagnostics** in the location list for optimizable structs

## Troubleshooting

- **Inlay hints not showing:** Neovim 0.10+ required for native inlay hint support. Use
  `:checkhealth vim.lsp` to verify.
- **Server not starting:** verify `gsa-lsp` is on your `$PATH` and executable. Check
  `:LspLog` for errors.
