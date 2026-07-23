package lsp

import "encoding/json"

// JSON-RPC protocol types

type Request struct {
	Jsonrpc string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type Response struct {
	Error   *ResponseError  `json:"error,omitempty"`
	Jsonrpc string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
}

type ResponseError struct {
	Message string `json:"message"`
	Code    int    `json:"code"`
}

type Notification struct {
	Jsonrpc string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// LSP types

type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

type Location struct {
	URI   string `json:"uri"`
	Range Range  `json:"range"`
}

// Initialize

type InitializeParams struct {
	Capabilities          ClientCapabilities `json:"capabilities"`
	RootURI               string             `json:"rootUri,omitempty"`
	InitializationOptions json.RawMessage    `json:"initializationOptions,omitempty"`
	ProcessID             int                `json:"processId,omitempty"`
}

// DidChangeConfigurationParams carries the "settings" payload of a
// workspace/didChangeConfiguration notification. gsa-lsp expects the same
// flat shape it accepts via initializationOptions.
type DidChangeConfigurationParams struct {
	Settings json.RawMessage `json:"settings"`
}

type ClientCapabilities struct {
	TextDocument TextDocumentClientCapabilities `json:"textDocument"`
}

type TextDocumentClientCapabilities struct {
	Hover       *HoverCapabilities       `json:"hover,omitempty"`
	CodeLens    *CodeLensCapabilities    `json:"codeLens,omitempty"`
	CodeAction  *CodeActionCapabilities  `json:"codeAction,omitempty"`
	Diagnostics *DiagnosticsCapabilities `json:"diagnostic,omitempty"`
}

type HoverCapabilities struct {
	ContentFormat       []string `json:"contentFormat,omitempty"`
	DynamicRegistration bool     `json:"dynamicRegistration,omitempty"`
}

type CodeLensCapabilities struct {
	DynamicRegistration bool `json:"dynamicRegistration,omitempty"`
}

type CodeActionCapabilities struct {
	DynamicRegistration bool `json:"dynamicRegistration,omitempty"`
}

type DiagnosticsCapabilities struct {
	DynamicRegistration bool `json:"dynamicRegistration,omitempty"`
}

type InitializeResult struct {
	Capabilities ServerCapabilities `json:"capabilities"`
}

type InlayHintOptions struct {
	ResolveProvider bool `json:"resolveProvider,omitempty"`
}

type ServerCapabilities struct {
	CodeLensProvider   *CodeLensOptions  `json:"codeLensProvider,omitempty"`
	InlayHintProvider  *InlayHintOptions `json:"inlayHintProvider,omitempty"`
	TextDocumentSync   int               `json:"textDocumentSync"`
	CodeActionProvider bool              `json:"codeActionProvider"`
	HoverProvider      bool              `json:"hoverProvider"`
}

type CodeLensOptions struct {
	ResolveProvider bool `json:"resolveProvider,omitempty"`
}

// Text Document Sync

type DidOpenTextDocumentParams struct {
	TextDocument TextDocumentItem `json:"textDocument"`
}

type TextDocumentItem struct {
	LanguageID string `json:"languageId"`
	Text       string `json:"text"`
	URI        string `json:"uri"`
	Version    int    `json:"version"`
}

type DidChangeTextDocumentParams struct {
	TextDocument   VersionedTextDocumentIdentifier  `json:"textDocument"`
	ContentChanges []TextDocumentContentChangeEvent `json:"contentChanges"`
}

type VersionedTextDocumentIdentifier struct {
	URI     string `json:"uri"`
	Version int    `json:"version"`
}

type TextDocumentContentChangeEvent struct {
	Text string `json:"text"`
}

type DidCloseTextDocumentParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type DidSaveTextDocumentParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type TextDocumentIdentifier struct {
	URI string `json:"uri"`
}

// Hover

type HoverParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Position     Position               `json:"position"`
}

type Hover struct {
	Range    *Range        `json:"range,omitempty"`
	Contents MarkupContent `json:"contents"`
}

type MarkupContent struct {
	Kind  string `json:"kind"`
	Value string `json:"value"`
}

// CodeLens

type CodeLensParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type CodeLens struct {
	Command *Command `json:"command,omitempty"`
	Range   Range    `json:"range"`
}

type Command struct {
	Title     string            `json:"title"`
	Command   string            `json:"command"`
	Arguments []json.RawMessage `json:"arguments,omitempty"`
}

// Diagnostics

type Diagnostic struct {
	Code     string `json:"code,omitempty"`
	Message  string `json:"message"`
	Source   string `json:"source,omitempty"`
	Range    Range  `json:"range"`
	Severity int    `json:"severity,omitempty"`
}

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// CodeAction

type CodeActionParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Context      CodeActionContext      `json:"context"`
	Range        Range                  `json:"range"`
}

type CodeActionContext struct {
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type CodeAction struct {
	Edit        *WorkspaceEdit `json:"edit,omitempty"`
	Kind        string         `json:"kind,omitempty"`
	Title       string         `json:"title"`
	IsPreferred bool           `json:"isPreferred,omitempty"`
}

type WorkspaceEdit struct {
	Changes map[string][]TextEdit `json:"changes,omitempty"`
}

type TextEdit struct {
	NewText string `json:"newText"`
	Range   Range  `json:"range"`
}

// Constants
// InlayHint

type InlayHintParams struct {
	Range        *Range                 `json:"range,omitempty"`
	TextDocument TextDocumentIdentifier `json:"textDocument"`
}

type InlayHint struct {
	Kind         *int            `json:"kind,omitempty"`
	Label        string          `json:"label"`
	Tooltip      string          `json:"tooltip,omitempty"`
	Data         json.RawMessage `json:"data,omitempty"`
	Position     Position        `json:"position"`
	PaddingLeft  bool            `json:"paddingLeft,omitempty"`
	PaddingRight bool            `json:"paddingRight,omitempty"`
}

type InlayHintLabelPart struct {
	Command  *Command  `json:"command,omitempty"`
	Location *Location `json:"location,omitempty"`
	Tooltip  string    `json:"tooltip,omitempty"`
	Value    string    `json:"value"`
}

var (
	InlayHintKindType      = new(1)
	InlayHintKindParameter = new(2)
)

// Constants
const (
	SeverityError       = 1
	SeverityWarning     = 2
	SeverityInformation = 3
	SeverityHint        = 4

	SyncNone        = 0
	SyncFull        = 1
	SyncIncremental = 2
)
