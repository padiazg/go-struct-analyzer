package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/padiazg/go-struct-analyzer/v2/lsp/internal/analysis"
	"github.com/padiazg/go-struct-analyzer/v2/lsp/internal/lsp"
	"github.com/padiazg/go-struct-analyzer/v2/lsp/internal/version"
)

func main() {
	if len(os.Args) < 2 {
		runLSP()
		return
	}

	switch os.Args[1] {
	case "analyze":
		runAnalyze(os.Args[2:])
	case "lsp":
		runLSP()
	case "version":
		fmt.Printf("gsa-lsp %s (commit: %s, built: %s)\n", version.Version, version.Commit, version.BuildDate)
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `gsa-lsp — Go Struct Analyzer LSP

Usage:
  gsa-lsp analyze [--arch amd64|arm64|386|arm] <file.go>
  gsa-lsp lsp
  gsa-lsp version

Commands:
  analyze   Analyze struct layout in a Go file (JSON output)
  lsp       Start LSP server (stdin/stdout JSON-RPC)
  version   Print version information
`)
	os.Exit(1)
}

func runAnalyze(args []string) {
	fs := flag.NewFlagSet("analyze", flag.ExitOnError)
	arch := fs.String("arch", "amd64", "target architecture (amd64, arm64, 386, arm)")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, "parsing flags: %w", err)
		os.Exit(1)
	}

	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gsa-lsp analyze [--arch amd64] <file.go>")
		os.Exit(1)
	}

	filePath := fs.Arg(0)
	result, err := analysis.AnalyzeFile(filePath, *arch)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(result); err != nil {
		fmt.Fprintf(os.Stderr, "encoding error: %v\n", err)
		os.Exit(1)
	}
}

func runLSP() {
	server := lsp.NewServer()
	if err := server.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "LSP error: %v\n", err)
		os.Exit(1)
	}
}
