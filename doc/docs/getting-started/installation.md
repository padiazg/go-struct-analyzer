# Installation

## VS Code Marketplace

[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/PatricioDiaz.go-struct-analyzer.svg)](https://marketplace.visualstudio.com/items?itemName=PatricioDiaz.go-struct-analyzer)

Search for **Go Struct Analyzer** in the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`), or install directly:

```shell
code --install-extension PatricioDiaz.go-struct-analyzer
```

[View on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=PatricioDiaz.go-struct-analyzer)

## Open VSX (VSCodium / Eclipse Theia / Gitpod)

[![Open VSX](https://img.shields.io/open-vsx/v/PatricioDiaz/go-struct-analyzer)](https://open-vsx.org/extension/PatricioDiaz/go-struct-analyzer)

Search for **Go Struct Analyzer** in your editor's Extensions panel, or download from:

[View on Open VSX Registry](https://open-vsx.org/extension/PatricioDiaz/go-struct-analyzer)

## From Source

Prerequisites: **Go 1.21+** and **Node.js 22+**.

```bash
git clone https://github.com/padiazg/go-struct-analyzer
cd go-struct-analyzer
make build
```

This compiles the Go LSP server (`gsa-lsp`) and the TypeScript extension.

Press `F5` in VS Code to open a new Extension Development Host window with the extension loaded.

## Build and Install Locally

```bash
# Install packaging tool (once)
npm install -g @vscode/vsce

# Compile and package
make build
vsce package
```

This generates a `go-struct-analyzer-<version>.vsix` file in the project root.

### Install the VSIX in VS Code

**Option A — Command line:**

```bash
code --install-extension go-struct-analyzer-*.vsix
```

**Option B — VS Code UI:**

1. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Click the `···` menu (top-right of the panel)
3. Select **Install from VSIX...**
4. Pick the generated `.vsix` file

**Reload VS Code** after installation (`Ctrl+Shift+P` → "Developer: Reload Window").

## Standalone CLI

The extension ships `gsa-lsp` — a Go binary for struct analysis outside VS Code:

```bash
make build-go
./gsa-lsp analyze [--arch amd64] file.go    # JSON output
./gsa-lsp lsp                                # LSP server mode
```
