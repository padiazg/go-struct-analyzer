# Usage

The Go Struct Analyzer provides several ways to inspect and optimize struct layouts:

| Feature | What it shows | How to access |
| - | - | - |
| [Hover Information](hover.md) | Field size, alignment, offset, padding | Hover over struct field or name |
| [Inline Annotations](annotations.md) | Struct and field sizes in the editor | Code lens above structs (toggle in settings) |
| [Warnings & Diagnostics](warnings.md) | Optimization opportunities, GC pressure | Yellow/blue underlines + Problems panel |
| [Quick Fix](quick-fix.md) | One-click field reorder | Lightbulb or `Ctrl+.` on warning |
| [Analyze Panel](analyze-panel.md) | Side-by-side layout comparison | Code lens click or Command Palette |
| [Configuration](configuration.md) | All settings reference | VS Code settings UI |

Each feature is designed to work without configuration — install the extension and open a Go file.

| Editor | Method |
| - | - |
| VS Code | Install the [VS Code extension](../getting-started/installation.md) from Marketplace |
| Zed | Install the [Zed dev extension](zed-installation.md) from `editors/zed/` |
| Any LSP client | gsa-lsp speaks standard LSP — configure any editor that supports inlayHint, hover, and diagnostics |
