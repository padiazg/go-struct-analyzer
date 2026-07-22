# Quick Start

This guide walks through the core features in under two minutes.

## 1. Install

```shell
code --install-extension PatricioDiaz.go-struct-analyzer
```

Or install from the VS Code Marketplace Extensions panel.

## 2. Open a Go file

Create a file with a struct that has padding issues:

```go
package main

type Event struct {
    A bool
    B int64
    C bool
    D int64
    E int32
    F bool
}
```

## 3. See the warnings

The struct name is underlined with a yellow warning. Hover to see:

```
⚠️ Struct layout can be optimized: 40 bytes → 24 bytes (saves 16 bytes)
```

The code lens above the struct shows:

```
Event  40 bytes total (can be 24 bytes)
```

## 4. Apply the quick fix

Click the lightbulb or press `Ctrl+.` with the cursor on `Event`. Choose **Reorder struct fields to optimize memory layout**.

```go
type Event struct {         // ✓ 24 bytes
    B int64
    D int64
    E int32
    A bool
    C bool
    F bool
}
```

Fields are reordered by alignment (largest first), minimizing padding while preserving tags, comments, and indentation.

## 5. Check the side panel

Click the code lens annotation or run **Go Struct: Analyze Struct Layout** from the Command Palette (`Ctrl+Shift+P`). The side panel shows:

- **Current Layout** — actual field offsets and padding
- **Size-Optimal** — minimal total size layout
- **GC-Optimal** — minimal GC scan range layout (when pointer fields are present)

## Next steps

- [Hover Information](../usage/hover.md) — detailed field-level data on mouseover
- [Inline Annotations](../usage/annotations.md) — code lens customization
- [Warnings & Diagnostics](../usage/warnings.md) — optimization and GC pressure hints
- [Quick Fix](../usage/quick-fix.md) — reorder fields in one click
- [Configuration](../usage/configuration.md) — all settings reference
