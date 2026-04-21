# Contributing to Go Struct Analyzer

Thank you for your interest in contributing! This document covers everything you need to know to set up your development environment and contribute effectively.

## Quick Start

```bash
# Clone and install dependencies
git clone https://github.com/padiazg/go-struct-analyzer
cd go-struct-analyzer
npm install

# Compile TypeScript
npm run compile
```

### Running in Development

1. Press **F5** in VS Code to launch an Extension Development Host
2. Open any Go file to test the extension
3. Make changes in `src/`, then either:
   - Run `npm run watch` for live recompilation
   - Or press **Ctrl+Shift+P** → "Developer: Reload Window" after recompiling

### Building for Local Installation

```bash
npm run compile
vsce package
```

This generates a `.vsix` file you can install via VS Code's "Install from VSIX" option.

---

## Project Structure

| File | Purpose |
|------|---------|
| `src/extension.ts` | Main entry point, registers all providers |
| `src/parser.ts` | Parses Go source to extract struct and field definitions |
| `src/analyzer.ts` | Calculates sizes, alignments, offsets, padding, and GC pointer bytes |
| `src/hover.ts` | Hover provider showing field details on mouseover |
| `src/codelens.ts` | Code lens provider for inline size annotations |
| `src/diagnostics.ts` | Diagnostic provider for optimization warnings |
| `src/codeaction.ts` | Quick fix provider for field reordering |

### Key Interfaces

- **GoStruct**: Represents a parsed struct with name, fields, and source location
- **GoField**: Individual field with name, type, tags, comments, and position info
- **FieldAnalysis**: Size, alignment, offset, and padding for a single field
- **StructAnalysis**: Complete analysis including total size, alignment, and all field details

---

## Development Workflow

1. **Edit code** in the `src/` directory
2. **Recompile** with `npm run compile` or use `npm run watch` for auto-rebuild
3. **Reload** the Extension Development Host (Ctrl+Shift+P → "Developer: Reload Window")
4. **Test** by opening Go files and verifying the extension behavior
5. **Repeat**

### Debugging Tips

- Check the **Output** panel (View → Output, then select "Go Struct Analyzer" from the dropdown) for console.log output
- Use `console.log()` statements in your code—they appear in the Output panel
- The extension runs in a separate process; errors may not show in the main Debug Console

---

## Testing and Validation

The extension's correctness is validated against Go's built-in `unsafe.Sizeof`. Two test files are included:

### test_go_file.go

Basic validation with common struct patterns:

```go
type BadLayout struct {
    A bool    // 1 byte
    B int64   // 8 bytes (7 bytes padding before)
    ...
}
```

Run this in Go to get actual sizes:

```bash
go run test_go_file.go
# Output:
# BadLayout size: 40
# GoodLayout size: 24
```

Then verify the extension's hover/codelens shows matching values.

### test_go_edge-cases.go

Comprehensive edge cases covering:

| Case | What it tests |
|------|---------------|
| 1 | Already-optimal struct (no quick fix offered) |
| 2 | Classic padding inefficiency (quick fix offered) |
| 3 | Single-field struct (no quick fix) |
| 4 | Empty struct (no quick fix) |
| 5 | Embedded fields (preserved during reorder) |
| 6 | Struct tags (preserved with field) |
| 7 | Inline comments (preserved with field) |
| 8 | Tags + comments together |
| 9 | Multiple structs in same file |
| 10 | Pointers (*Node) |
| 11 | Composite types ([]string, map, string) |
| 12 | Fixed arrays |
| 13 | Generic structs (`type Foo[T any]`) |
| 14 | Nested structs |
| 15 | interface{} type |
| 16 | Channels and functions |

Each case documents expected behavior—use these to verify your changes don't break existing functionality.

### Validation Checklist

- [ ] Open test_go_file.go in Extension Development Host
- [ ] Hover over each struct and verify sizes match `go run` output
- [ ] Verify code lens annotations show correct sizes
- [ ] Confirm quick fixes are offered only where appropriate (cases 2, 5-16, not 1, 3, 4)
- [ ] Check that tags and comments are preserved after applying quick fix

---

## Code Style

Follow these conventions (from CLAUDE.md):

- **TypeScript**: Strict mode enabled—always use explicit types
- **File naming**: snake_case (e.g., `go_parser.ts`)
- **Code naming**:
  - Variables/functions: camelCase
  - Classes: PascalCase
- **Indentation**: 4 spaces
- **Import order**: vscode imports first, then internal modules
- **No comments** unless explaining non-obvious behavior

### TypeScript Config

The project uses strict TypeScript (`tsconfig.json` has `"strict": true`). If you need to bypass strict checks (rare), use `(param: any)` rather than disabling strict mode.

---

## Architecture Notes

### Go Memory Alignment Rules

The extension implements Go's memory layout algorithm:

1. **Field alignment**: Each field aligns to its natural alignment boundary
   - `int8`/`bool`: 1 byte
   - `int16`: 2 bytes
   - `int32`/`float32`: 4 bytes
   - `int64`/`float64`/pointers: 8 bytes (amd64/arm64)

2. **Struct alignment**: The largest alignment of any field

3. **Struct size**: Padded to be a multiple of struct alignment

### Architecture-Dependent Sizes

| Type | amd64/arm64 | 386/arm |
|------|-------------|---------|
| pointer | 8 bytes | 4 bytes |
| `int`/`uint` | 8 bytes | 4 bytes |
| `uintptr` | 8 bytes | 4 bytes |

Configure the target architecture via `goStructAnalyzer.architecture` setting.

### GC Pointer Types

For GC scan range calculations, these types are considered pointers:

- `*T` (pointers)
- `string` (contains pointer to data)
- `[]T` (slice header contains pointer)
- `map[K]V` (map header contains pointer)
- `chan T` (channel header contains pointer)
- `func(...)` (function pointer)
- `interface{}` (contains two pointers)

Grouping these at the start of a struct reduces the bytes the garbage collector must scan.

---

## Adding New Features

### Where to Add Code

- **New VS Code provider** (hover, code lens, diagnostics, code action):
  1. Create provider class in `src/`
  2. Register in `extension.ts` (see existing providers for patterns)
  3. Add configuration in `package.json` under `contributes.configuration`

- **New Go type support**: Add to `analyzer.ts` in the type size/alignment mappings
- **New setting**: Add to `package.json` → `contributes.configuration.properties`, then use in your code via `vscode.workspace.getConfiguration()`

### Extension Provider Patterns

All providers receive `GoStructParser` and `StructAnalyzer` instances:

```typescript
class MyProvider {
    constructor(
        private parser: GoStructParser,
        private analyzer: StructAnalyzer
    ) {}
}
```

Providers implement VS Code interfaces:
- `HoverProvider`: `provideHover(document, position)`
- `CodeLensProvider`: `provideCodeLenses(document)`
- `DiagnosticProvider`: `provideDiagnostics(document)`
- `CodeActionProvider`: `provideCodeActions(document, range)`

---

## Pull Request Process

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feat/my-feature`
3. **Make your changes** following the code style
4. **Test manually** in Extension Development Host
5. **Validate** against Go test files
6. **Submit a PR** with:
   - Clear description of what and why
   - Testing performed
   - Screenshots if UI changed

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Manual testing done in Extension Development Host
- [ ] Validated against test_go_file.go and test_go_edge-cases.go
- [ ] No console.log statements left in production code (optional for debugging)
- [ ] package.json version unchanged (maintainer handles versions)

---

## Version and Release Process

The maintainer handles releases. If you're contributing a change that warrants a version bump, suggest the appropriate semver increment in your PR:

- **Patch** (1.2.0 → 1.2.1): Bug fixes
- **Minor** (1.2.0 → 1.3.0): New features, backward-compatible
- **Major** (1.2.0 → 2.0.0): Breaking changes

### Release Checklist (Maintainer)

1. Bump version in `package.json`
2. Add entry to `changelog.md` with date
3. Run `npm run compile && vsce package`
4. Create GitHub release with `.vsix` artifact
5. Publish to VS Code Marketplace (vsce publish)

---

## Questions?

Open an issue at https://github.com/padiazg/go-struct-analyzer/issues for:

- Bug reports
- Feature requests
- Clarification on this guide
- Help with development setup
