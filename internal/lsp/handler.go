package lsp

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"net/url"
	"os"
	"strings"

	"github.com/padiazg/go-struct-analyzer/v2/internal/analysis"
)

func uriToPath(uri string) string {
	u, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	if u.Scheme == "file" {
		return u.Path
	}
	if len(uri) > 8 && uri[:8] == "file:///" {
		p := uri[8:]
		if len(p) > 1 && p[1] == ':' {
			return p
		}
	}
	return uri
}

func pathToURI(path string) string {
	return "file://" + path
}

// -- Initialize -----------------------------------------------------------

func (s *Server) handleInitialize(body []byte, result *any) error {
	var params InitializeParams
	if err := json.Unmarshal(body, &params); err != nil {
		return fmt.Errorf("unmarshal initialize: %w", err)
	}

	s.applySettings(params.InitializationOptions)

	*result = InitializeResult{
		Capabilities: ServerCapabilities{
			TextDocumentSync:   SyncFull,
			HoverProvider:      true,
			InlayHintProvider:  &InlayHintOptions{ResolveProvider: false},
			CodeLensProvider:   &CodeLensOptions{ResolveProvider: false},
			CodeActionProvider: true,
		},
	}
	return nil
}

// settingsPayload is the flat settings shape gsa-lsp understands, sent by
// clients either once via initializationOptions (at initialize) or
// repeatedly via workspace/didChangeConfiguration. Enable* fields are
// pointers so omitted keys don't override the current value with the zero
// value (false).
type settingsPayload struct {
	EnableGCPressureWarnings         *bool  `json:"enableGCPressureWarnings"`
	EnableReorderCodeAction          *bool  `json:"enableReorderCodeAction"`
	EnableStructOptimizationWarnings *bool  `json:"enableStructOptimizationWarnings"`
	Architecture                     string `json:"architecture"`
	GcPressureSeverityWarning        bool   `json:"gcPressureSeverityWarning"`
}

// applySettings parses a settingsPayload from raw (initializationOptions or
// workspace/didChangeConfiguration "settings") and updates the server's
// live configuration. Unset/omitted fields are left untouched.
func (s *Server) applySettings(raw json.RawMessage) {
	if raw == nil || string(raw) == "null" {
		return
	}

	var opts settingsPayload
	if err := json.Unmarshal(raw, &opts); err != nil {
		return
	}

	s.mu.Lock()
	if opts.Architecture != "" {
		s.arch = opts.Architecture
	}
	s.gcWarn = opts.GcPressureSeverityWarning
	if opts.EnableStructOptimizationWarnings != nil {
		s.enableStructWarnings = *opts.EnableStructOptimizationWarnings
	}
	if opts.EnableReorderCodeAction != nil {
		s.enableReorderAction = *opts.EnableReorderCodeAction
	}
	if opts.EnableGCPressureWarnings != nil {
		s.enableGCWarnings = *opts.EnableGCPressureWarnings
	}
	s.mu.Unlock()
}

// handleDidChangeConfiguration applies updated settings pushed by the client
// via workspace/didChangeConfiguration and re-analyzes every open document
// so diagnostics/code actions reflect the new configuration immediately.
func (s *Server) handleDidChangeConfiguration(body []byte) {
	var params DidChangeConfigurationParams
	if err := json.Unmarshal(body, &params); err != nil {
		return
	}

	s.applySettings(unwrapSectionSettings(params.Settings))

	s.mu.Lock()
	uris := make([]string, 0, len(s.documents))
	for uri := range s.documents {
		uris = append(uris, uri)
	}
	s.mu.Unlock()

	for _, uri := range uris {
		s.analyzeFile(uri)
	}
}

// unwrapSectionSettings accepts either the flat settingsPayload shape (used
// by initializationOptions and by simple clients) or the LSP-conventional
// shape where settings are nested under the "goStructAnalyzer" section name
// (produced e.g. by Emacs eglot's eglot-workspace-configuration, and by
// vscode-languageclient's configurationSection sync). If a "goStructAnalyzer"
// key is present, its contents are unwrapped; otherwise raw is returned as-is.
func unwrapSectionSettings(raw json.RawMessage) json.RawMessage {
	var wrapper struct {
		GoStructAnalyzer json.RawMessage `json:"goStructAnalyzer"`
	}
	if err := json.Unmarshal(raw, &wrapper); err == nil && len(wrapper.GoStructAnalyzer) > 0 {
		return wrapper.GoStructAnalyzer
	}
	return raw
}

// -- Text Document Sync ---------------------------------------------------

func (s *Server) handleDidOpen(body []byte) {
	var params DidOpenTextDocumentParams
	if err := json.Unmarshal(body, &params); err != nil {
		return
	}
	s.mu.Lock()
	s.documents[params.TextDocument.URI] = &Document{
		URI:     params.TextDocument.URI,
		Version: params.TextDocument.Version,
		Text:    params.TextDocument.Text,
	}
	s.mu.Unlock()
	s.analyzeFile(params.TextDocument.URI)
}

func (s *Server) handleDidChange(body []byte) {
	var params DidChangeTextDocumentParams
	if err := json.Unmarshal(body, &params); err != nil {
		return
	}
	s.mu.Lock()
	if doc, ok := s.documents[params.TextDocument.URI]; ok && len(params.ContentChanges) > 0 {
		doc.Version = params.TextDocument.Version
		doc.Text = params.ContentChanges[len(params.ContentChanges)-1].Text
	}
	s.mu.Unlock()
	s.analyzeFile(params.TextDocument.URI)
}

func (s *Server) handleDidSave(body []byte) {
	var params DidSaveTextDocumentParams
	if err := json.Unmarshal(body, &params); err != nil {
		return
	}
	s.analyzeFile(params.TextDocument.URI)
}

func (s *Server) handleDidClose(body []byte) {
	var params DidCloseTextDocumentParams
	if err := json.Unmarshal(body, &params); err != nil {
		return
	}
	s.mu.Lock()
	delete(s.documents, params.TextDocument.URI)
	delete(s.results, params.TextDocument.URI)
	s.mu.Unlock()
}

// -- Analysis -------------------------------------------------------------

func (s *Server) analyzeFile(uri string) {
	path := uriToPath(uri)
	s.mu.Lock()
	arch := s.arch
	doc := s.documents[uri]
	s.mu.Unlock()

	var src string
	if doc != nil {
		src = doc.Text
	}
	result, err := analysis.AnalyzeFile(path, arch, src)
	if err != nil {
		s.sendNotification("textDocument/publishDiagnostics", PublishDiagnosticsParams{
			URI:         uri,
			Diagnostics: []Diagnostic{},
		})
		return
	}

	diags := s.buildDiagnostics(result, uri)
	codelenses := s.buildCodeLenses(result, uri)

	s.mu.Lock()
	s.results[uri] = &AnalysisResult{
		Diagnostics: diags,
		CodeLenses:  codelenses,
		StructCnt:   len(result.Structs),
	}
	s.raw[uri] = result
	s.mu.Unlock()

	s.sendNotification("textDocument/publishDiagnostics", PublishDiagnosticsParams{
		URI:         uri,
		Diagnostics: diags,
	})
}

func (s *Server) handleStructData(params []byte, result *any) error {
	p := pathToURI("")
	var sd StructDataParams
	if err := json.Unmarshal(params, &sd); err != nil {
		return fmt.Errorf("unmarshal structData: %w", err)
	}
	_ = p

	path := uriToPath(sd.TextDocument.URI)
	_ = path

	s.mu.Lock()
	raw, ok := s.raw[sd.TextDocument.URI]
	s.mu.Unlock()
	if !ok || raw == nil {
		return nil
	}

	*result = raw
	return nil
}

// func (s *Server) getAnalysis(uri string) *analysis.AnalysisResult {
// 	path := uriToPath(uri)
// 	s.mu.Lock()
// 	arch := s.arch
// 	doc := s.documents[uri]
// 	s.mu.Unlock()

// 	var src string
// 	if doc != nil {
// 		src = doc.Text
// 	}
// 	result, err := analysis.AnalyzeFile(path, arch, src)
// 	if err != nil {
// 		return nil
// 	}
// 	return result
// }

// -- Diagnostics ----------------------------------------------------------

func (s *Server) buildDiagnostics(result *analysis.AnalysisResult, uri string) []Diagnostic {
	diags := make([]Diagnostic, 0)

	s.mu.Lock()
	gcWarn := s.gcWarn
	enableStructWarnings := s.enableStructWarnings
	enableGCWarnings := s.enableGCWarnings
	s.mu.Unlock()

	for _, st := range result.Structs {
		if st.Fields == nil || st.Line == 0 {
			continue
		}

		if enableStructWarnings && st.OptimalSize < st.TotalSize {
			diags = append(diags, Diagnostic{
				Range: Range{
					Start: Position{Line: st.Line - 1, Character: 5},
					End:   Position{Line: st.Line - 1, Character: 5 + len(st.Name)},
				},
				Severity: SeverityWarning,
				Source:   "gsa-lsp",
				Message:  fmt.Sprintf("Struct layout can be optimized: %d bytes → %d bytes (saves %d bytes)", st.TotalSize, st.OptimalSize, st.TotalSize-st.OptimalSize),
				Code:     "struct-layout-optimization",
			})
		}

		if enableGCWarnings && st.OptimalPointerBytes < st.PointerBytes {
			severity := SeverityHint
			if gcWarn {
				severity = SeverityWarning
			}
			diags = append(diags, Diagnostic{
				Range: Range{
					Start: Position{Line: st.Line - 1, Character: 5},
					End:   Position{Line: st.Line - 1, Character: 5 + len(st.Name)},
				},
				Severity: severity,
				Source:   "gsa-lsp",
				Message:  fmt.Sprintf("GC scan range can be reduced: %d bytes → %d bytes", st.PointerBytes, st.OptimalPointerBytes),
				Code:     "struct-gc-pointer-bytes",
			})
		}
	}

	return diags
}

// -- Hover ----------------------------------------------------------------

func (s *Server) handleHover(body []byte, result *any) error {
	var params HoverParams
	if err := json.Unmarshal(body, &params); err != nil {
		return fmt.Errorf("unmarshal hover: %w", err)
	}

	s.mu.Lock()
	raw, ok := s.raw[params.TextDocument.URI]
	s.mu.Unlock()
	if !ok || raw == nil {
		return nil
	}

	line := params.Position.Line + 1
	for _, st := range raw.Structs {
		if st.Line == line {
			*result = s.buildStructHover(st)
			return nil
		}
	}

	return nil
}

func (s *Server) buildStructHover(st analysis.StructInfo) Hover {
	var b strings.Builder

	fmt.Fprintf(&b, "**struct %s** — %dB (align %d, GC %dB)", st.Name, st.TotalSize, st.Alignment, st.PointerBytes)
	if st.OptimalSize < st.TotalSize {
		fmt.Fprintf(&b, " → %dB (−%dB)", st.OptimalSize, st.TotalSize-st.OptimalSize)
	}
	b.WriteString("  \n\n")

	if len(st.Fields) == 0 {
		return Hover{Contents: MarkupContent{Kind: "markdown", Value: b.String()}}
	}

	b.WriteString("**Memory Layout:**  \n```\n")
	for _, f := range st.Fields {
		if f.Padding > 0 {
			fmt.Fprintf(&b, "  [%3d] --- padding %d bytes ---\n", f.Offset-f.Padding, f.Padding)
		}
		fmt.Fprintf(&b, "  [%3d] %s (%s, %d bytes)\n", f.Offset, f.Name, f.Type, f.Size)
	}
	last := st.Fields[len(st.Fields)-1]
	end := last.Offset + last.Size
	if end < st.TotalSize {
		fmt.Fprintf(&b, "  [%3d] --- final padding %d bytes ---\n", end, st.TotalSize-end)
	}
	b.WriteString("```\n")

	if len(st.OptimalFields) > 0 {
		b.WriteString("\n**Optimal Layout:**  \n```\n")
		for _, f := range st.OptimalFields {
			fmt.Fprintf(&b, "  [%3d] %s (%s, %d bytes)\n", f.Offset, f.Name, f.Type, f.Size)
		}
		b.WriteString("```\n")
	}

	return Hover{
		Contents: MarkupContent{
			Kind:  "markdown",
			Value: b.String(),
		},
	}
}

// -- InlayHint ------------------------------------------------------------

func (s *Server) handleInlayHint(body []byte, result *any) error {
	var params InlayHintParams
	if err := json.Unmarshal(body, &params); err != nil {
		return fmt.Errorf("unmarshal inlayHint: %w", err)
	}

	s.mu.Lock()
	raw, ok := s.raw[params.TextDocument.URI]
	s.mu.Unlock()
	if !ok || raw == nil {
		*result = []InlayHint{}
		return nil
	}

	var hints []InlayHint
	for _, st := range raw.Structs {
		if st.Line == 0 {
			continue
		}
		label := fmt.Sprintf("%dB", st.TotalSize)
		tooltip := fmt.Sprintf("struct %s: %d bytes (align %d, GC %dB)", st.Name, st.TotalSize, st.Alignment, st.PointerBytes)
		if st.OptimalSize < st.TotalSize {
			label = fmt.Sprintf("%dB → %dB", st.TotalSize, st.OptimalSize)
			tooltip += fmt.Sprintf("\noptimal: %d bytes (saves %d)", st.OptimalSize, st.TotalSize-st.OptimalSize)
		}
		hints = append(hints, InlayHint{
			Position:    Position{Line: st.Line - 1, Character: 200},
			Label:       label,
			Kind:        InlayHintKindType,
			PaddingLeft: true,
			Tooltip:     tooltip,
		})

		for _, f := range st.Fields {
			if f.Line == 0 {
				continue
			}
			label := fmt.Sprintf("[%d] %dB", f.Offset, f.Size)
			tooltip := fmt.Sprintf("type: %s\noffset: %d\nsize: %d\nalign: %d", f.Type, f.Offset, f.Size, f.Alignment)
			if f.Padding > 0 {
				label = fmt.Sprintf("+%dpad %s", f.Padding, label)
				tooltip += fmt.Sprintf("\npreceding padding: %d", f.Padding)
			}
			hints = append(hints, InlayHint{
				Position:    Position{Line: f.Line - 1, Character: 200},
				Label:       label,
				Kind:        InlayHintKindType,
				PaddingLeft: true,
				Tooltip:     tooltip,
			})
		}
	}

	*result = hints
	return nil
}

// -- CodeLens -------------------------------------------------------------

func (s *Server) handleCodeLens(body []byte, result *any) error {
	var params CodeLensParams
	if err := json.Unmarshal(body, &params); err != nil {
		return fmt.Errorf("unmarshal codelens: %w", err)
	}

	s.mu.Lock()
	raw, ok := s.raw[params.TextDocument.URI]
	s.mu.Unlock()
	if !ok || raw == nil {
		*result = []CodeLens{}
		return nil
	}

	*result = s.buildCodeLenses(raw, params.TextDocument.URI)
	return nil
}

func (s *Server) buildCodeLenses(result *analysis.AnalysisResult, _ string) []CodeLens {
	lenses := make([]CodeLens, 0)

	for _, st := range result.Structs {
		if st.Line == 0 {
			continue
		}
		nameLen := len(st.Name)
		lenses = append(lenses, CodeLens{
			Range: Range{
				Start: Position{Line: st.Line - 1, Character: 5},
				End:   Position{Line: st.Line - 1, Character: 5 + nameLen},
			},
			Command: &Command{
				Title:   fmt.Sprintf("%d bytes total", st.TotalSize),
				Command: "",
			},
		})
	}

	return lenses
}

// -- CodeAction -----------------------------------------------------------

func (s *Server) handleCodeAction(body []byte, result *any) error {
	var params CodeActionParams
	if err := json.Unmarshal(body, &params); err != nil {
		return fmt.Errorf("unmarshal codeaction: %w", err)
	}

	if len(params.Context.Diagnostics) == 0 {
		*result = []CodeAction{}
		return nil
	}

	s.mu.Lock()
	enableReorderAction := s.enableReorderAction
	s.mu.Unlock()
	if !enableReorderAction {
		*result = []CodeAction{}
		return nil
	}

	s.mu.Lock()
	analysisResult, ok := s.raw[params.TextDocument.URI]
	s.mu.Unlock()
	if !ok || analysisResult == nil {
		*result = []CodeAction{}
		return nil
	}

	var actions []CodeAction
	path := uriToPath(params.TextDocument.URI)

	// Iterate diagnostics first, structs second: this way each diagnostic
	// (layout AND gc-pointer-bytes) produces its own quick fix, so a struct
	// that triggers both diagnostics on the same line gets both actions
	// instead of only the first one matched.
	for _, diag := range params.Context.Diagnostics {
		if diag.Code != "struct-layout-optimization" && diag.Code != "struct-gc-pointer-bytes" {
			continue
		}

		for _, st := range analysisResult.Structs {
			if st.Line-1 != diag.Range.Start.Line {
				continue
			}

			edits, err := s.generateReorderEdits(path, st)
			if err != nil {
				break
			}

			title := "Reorder struct fields to optimize memory layout"
			if diag.Code == "struct-gc-pointer-bytes" {
				title = "Reorder struct fields to reduce GC scan range"
			}

			actions = append(actions, CodeAction{
				Title:       title,
				Kind:        "quickfix",
				Edit:        &WorkspaceEdit{Changes: map[string][]TextEdit{params.TextDocument.URI: edits}},
				IsPreferred: false,
			})
			break
		}
	}

	*result = actions
	return nil
}

func (s *Server) generateReorderEdits(path string, st analysis.StructInfo) ([]TextEdit, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return nil, err
	}

	for _, decl := range f.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, spec := range genDecl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok || typeSpec.Name.Name != st.Name {
				continue
			}
			structType, ok := typeSpec.Type.(*ast.StructType)
			if !ok || structType.Fields == nil {
				continue
			}

			openPos := fset.Position(structType.Pos())

			src, err := os.ReadFile(path)
			if err != nil {
				return nil, err
			}
			lines := strings.Split(string(src), "\n")

			// Find closing brace
			closeLine := openPos.Line - 1
			braceCount := 0
			for i := openPos.Line - 1; i < len(lines); i++ {
				for _, ch := range lines[i] {
					if ch == '{' {
						braceCount++
					}
					if ch == '}' {
						braceCount--
					}
				}
				if braceCount == 0 {
					closeLine = i
					break
				}
			}

			openLine := lines[openPos.Line-1]
			closeLineText := lines[closeLine]

			// Build reordered field lines
			fieldLines := make(map[string]string)
			for _, field := range structType.Fields.List {
				for _, name := range field.Names {
					fieldLine := lines[fset.Position(field.Pos()).Line-1]
					fieldLines[name.Name] = fieldLine
				}
			}

			var newBody []string
			for _, of := range st.OptimalFields {
				if line, ok := fieldLines[of.Name]; ok {
					newBody = append(newBody, line)
				}
			}
			if len(newBody) == 0 {
				return nil, nil
			}

			var newStruct strings.Builder
			newStruct.WriteString(openLine)
			newStruct.WriteString("\n")
			for _, l := range newBody {
				newStruct.WriteString(l)
				newStruct.WriteString("\n")
			}
			newStruct.WriteString(closeLineText)

			return []TextEdit{{
				Range: Range{
					Start: Position{Line: openPos.Line - 1, Character: 0},
					End:   Position{Line: closeLine, Character: len(closeLineText)},
				},
				NewText: newStruct.String(),
			}}, nil
		}
	}

	return nil, fmt.Errorf("struct %s not found", st.Name)
}
