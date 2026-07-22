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
	Jsonrpc string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *ResponseError  `json:"error,omitempty"`
}

type ResponseError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
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
	ProcessID             int                `json:"processId,omitempty"`
	RootURI               string             `json:"rootUri,omitempty"`
	Capabilities          ClientCapabilities `json:"capabilities"`
	InitializationOptions json.RawMessage    `json:"initializationOptions,omitempty"`
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
	DynamicRegistration bool     `json:"dynamicRegistration,omitempty"`
	ContentFormat       []string `json:"contentFormat,omitempty"`
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
	TextDocumentSync   int               `json:"textDocumentSync"`
	HoverProvider      bool              `json:"hoverProvider"`
	InlayHintProvider  *InlayHintOptions `json:"inlayHintProvider,omitempty"`
	CodeLensProvider   *CodeLensOptions  `json:"codeLensProvider,omitempty"`
	CodeActionProvider bool              `json:"codeActionProvider"`
}

type CodeLensOptions struct {
	ResolveProvider bool `json:"resolveProvider,omitempty"`
}

// Text Document Sync

type DidOpenTextDocumentParams struct {
	TextDocument TextDocumentItem `json:"textDocument"`
}

type TextDocumentItem struct {
	URI        string `json:"uri"`
	LanguageID string `json:"languageId"`
	Version    int    `json:"version"`
	Text       string `json:"text"`
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
	Contents MarkupContent `json:"contents"`
	Range    *Range        `json:"range,omitempty"`
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
	Range   Range    `json:"range"`
	Command *Command `json:"command,omitempty"`
}

type Command struct {
	Title     string            `json:"title"`
	Command   string            `json:"command"`
	Arguments []json.RawMessage `json:"arguments,omitempty"`
}

// Diagnostics

type Diagnostic struct {
	Range    Range  `json:"range"`
	Severity int    `json:"severity,omitempty"`
	Source   string `json:"source,omitempty"`
	Message  string `json:"message"`
	Code     string `json:"code,omitempty"`
}

type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// CodeAction

type CodeActionParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Range        Range                  `json:"range"`
	Context      CodeActionContext      `json:"context"`
}

type CodeActionContext struct {
	Diagnostics []Diagnostic `json:"diagnostics"`
}

type CodeAction struct {
	Title       string         `json:"title"`
	Kind        string         `json:"kind,omitempty"`
	Edit        *WorkspaceEdit `json:"edit,omitempty"`
	IsPreferred bool           `json:"isPreferred,omitempty"`
}

type WorkspaceEdit struct {
	Changes map[string][]TextEdit `json:"changes,omitempty"`
}

type TextEdit struct {
	Range   Range  `json:"range"`
	NewText string `json:"newText"`
}

// Constants
// InlayHint

type InlayHintParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Range        *Range                 `json:"range,omitempty"`
}

type InlayHint struct {
	Position     Position             `json:"position"`
	Label        string               `json:"label"`
	Kind         *int                 `json:"kind,omitempty"`
	Tooltip      string               `json:"tooltip,omitempty"`
	PaddingLeft  bool                 `json:"paddingLeft,omitempty"`
	PaddingRight bool                 `json:"paddingRight,omitempty"`
	Data         json.RawMessage      `json:"data,omitempty"`
}

type InlayHintLabelPart struct {
	Value    string       `json:"value"`
	Tooltip  string       `json:"tooltip,omitempty"`
	Location *Location    `json:"location,omitempty"`
	Command  *Command     `json:"command,omitempty"`
}

var (
	InlayHintKindType      = ptr(1)
	InlayHintKindParameter = ptr(2)
)

func ptr[T any](v T) *T { return &v }

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
