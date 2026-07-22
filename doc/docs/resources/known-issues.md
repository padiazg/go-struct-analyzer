# Known Issues

## Memory layout visualization on large structs

The analyze panel may not render well for very large structs (50+ fields). The layout viewer is designed for typical structs.

## Go LSP startup delay

On first activation, the Go LSP server needs to load `go/packages` which may take a moment for large projects. Subsequent analysis is cached per-file.

## Debug console output

The Go LSP server logs to stderr. In VS Code Extension Development Host, this appears in the Output panel under "Go Struct Analyzer".
