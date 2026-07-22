# Warnings & Diagnostics

The extension provides two kinds of diagnostics: memory layout optimization warnings and GC pressure hints.

## Optimization Warnings

When a struct wastes space due to sub-optimal field ordering, a yellow warning underline appears on the struct name:

```
⚠️ Struct layout can be optimized: 40 bytes → 24 bytes (saves 16 bytes)
```

These also appear in the **Problems** panel (`Ctrl+Shift+M` / `Cmd+Shift+M`).

Fields with large alignment (int64, float64, pointers) should be placed first to minimize padding.

## GC Pressure Hints

When pointer fields (maps, channels, functions, pointers, strings, slices) are not grouped at the start of the struct, a blue hint underline appears:

```
💡 Struct GC scan range can be reduced: 72 bytes → 48 bytes (reduces GC pressure)
```

Grouping pointer-containing fields reduces the number of bytes the garbage collector must scan.

### Promotion to warnings

Set `goStructAnalyzer.gcPressureSeverityWarning: true` to show GC pressure issues as yellow warnings instead of blue hints.

## Disabling

| Setting | Effect |
| - | - |
| `goStructAnalyzer.enableStructOptimizationWarnings` | Toggle all optimization warnings |
| `goStructAnalyzer.enableGCPressureWarnings` | Toggle GC pressure hints |
