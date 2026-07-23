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

No plugins needed — Neovim's built-in LSP client supports all required methods.

## Installation

### 1. Install gsa-lsp binary

```bash
go install github.com/padiazg/go-struct-analyzer/v2/lsp@latest
```

Or download a pre-built binary from [GitHub Releases](https://github.com/padiazg/go-struct-analyzer/releases).

### 2. Configure Neovim LSP

Add to your Neovim config (e.g. `~/.config/nvim/init.lua`):

```lua
vim.lsp.config('gsa_lsp', {
  cmd = { 'gsa-lsp', 'lsp' },
  filetypes = { 'go' },
  init_options = {
    architecture = 'amd64',
    gcPressureSeverityWarning = false,
    enableStructOptimizationWarnings = true,
    enableReorderCodeAction = true,
    enableGCPressureWarnings = true,
  },
})

vim.lsp.enable('gsa_lsp')
```

gsa-lsp starts alongside gopls when you open a Go file. Neovim displays inlay hints,
hover information, diagnostics, and code actions automatically.

> **Avoid duplicate registration.** Registering gsa-lsp through both an autocmd +
> `vim.lsp.start` and `vim.lsp.config`/`vim.lsp.enable` (or with two different client
> names) spins up two independent server processes. Neovim then renders one hover block
> per client, producing duplicated content. Use exactly one registration method.

### Using with gopls

If you already have gopls configured, gsa-lsp works as a secondary server — both
run concurrently. gopls provides navigation, completion, and refactoring while
gsa-lsp provides struct layout analysis.

### LazyVim

LazyVim's `nvim-lspconfig` spec loops over an `opts.servers` table and calls
`vim.lsp.config`/`vim.lsp.enable` for you. In your LazyVim config:

```lua
return {
  opts = {
    servers = {
      gsa_lsp = {
        cmd = { 'gsa-lsp', 'lsp' },
        init_options = {
          architecture = 'amd64',
          gcPressureSeverityWarning = false,
          enableStructOptimizationWarnings = true,
          enableReorderCodeAction = true,
          enableGCPressureWarnings = true,
        },
      },
    },
  },
}
```

### Changing settings without restarting (advanced)

gsa-lsp applies configuration changes live via `workspace/didChangeConfiguration`
— no server restart needed. Push new settings from a keymap or autocmd:

```lua
vim.keymap.set('n', '<leader>gsr', function()
  local clients = vim.lsp.get_clients({ name = 'gsa_lsp' })
  for _, client in ipairs(clients) do
    client:notify('workspace/didChangeConfiguration', {
      settings = { goStructAnalyzer = { enableReorderCodeAction = false } },
    })
  end
end, { desc = 'Disable gsa-lsp reorder quick fix' })
```

## Verifying

Open a Go file with struct types. You should see:

- **Inlay hints** showing struct total size after `type Foo struct` and field offset/size on each field
- **Hover** over a struct name (`K` by default) for full memory layout
- **Diagnostics** in the location list for optimizable structs

## Troubleshooting

- **Inlay hints not showing:** Neovim 0.10+ required. Inlay hints are **opt-in** — enable
  them in your LSP attach handler or `init.lua`:

  ```lua
  vim.api.nvim_create_autocmd('LspAttach', {
    callback = function(args)
      vim.lsp.inlay_hint.enable(true, { bufnr = args.buf })
    end,
  })
  ```

  Or toggle per-buffer with `:LspInlayHint`. Run `:checkhealth vim.lsp` to verify LSP
  client state.

- **Hover shows nothing:** `K` (default) triggers `vim.lsp.buf.hover()` — verify
  the keymap isn't shadowed by another plugin (`:map K`). gsa-lsp returns a full
  memory layout table on any struct definition line.

- **Server not starting:** verify `gsa-lsp` is on your `$PATH` and executable. Check
  `:LspLog` for errors.

- **Hover shows duplicated content:** two separate LSP clients are running. This
  happens when gsa-lsp is registered twice — e.g. one registration via
  `FileType` autocmd + `vim.lsp.start` and another via `vim.lsp.config`/`vim.lsp.enable`,
  or using two different client names. Remove the duplicate registration; Neovim should
  show exactly one hover block per struct.
