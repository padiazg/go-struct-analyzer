package lsp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/padiazg/go-struct-analyzer/v2/lsp/internal/analysis"
	"github.com/padiazg/go-struct-analyzer/v2/lsp/internal/version"
)

type StructDataParams struct {
	TextDocument struct {
		URI string `json:"uri"`
	} `json:"textDocument"`
}

type Server struct {
	writer               io.Writer
	documents            map[string]*Document
	raw                  map[string]*analysis.AnalysisResult
	results              map[string]*AnalysisResult
	arch                 string
	mu                   sync.Mutex
	enableGCWarnings     bool
	enableReorderAction  bool
	enableStructWarnings bool
	gcWarn               bool
	initialized          bool
}

type Document struct {
	Text    string
	URI     string
	Version int
}

type AnalysisResult struct {
	Markdown    string
	Diagnostics []Diagnostic
	CodeLenses  []CodeLens
	StructCnt   int
}

func NewServer() *Server {
	return &Server{
		documents:            make(map[string]*Document),
		results:              make(map[string]*AnalysisResult),
		raw:                  make(map[string]*analysis.AnalysisResult),
		arch:                 "amd64",
		enableStructWarnings: true,
		enableReorderAction:  true,
		enableGCWarnings:     true,
		writer:               os.Stdout,
	}
}

func (s *Server) Run() error {
	reader := bufio.NewReader(os.Stdin)
	for {
		contentLength, err := s.readHeader(reader)
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("read header: %w", err)
		}

		body := make([]byte, contentLength)
		if _, err := io.ReadFull(reader, body); err != nil {
			return fmt.Errorf("read body: %w", err)
		}

		s.handleMessage(body)
	}
}

func (s *Server) readHeader(reader *bufio.Reader) (int, error) {
	contentLength := 0
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return 0, err
		}
		line = strings.TrimSuffix(line, "\r\n")
		line = strings.TrimSuffix(line, "\n")

		if line == "" {
			break
		}

		if after, ok := strings.CutPrefix(line, "Content-Length: "); ok {
			contentLength, err = strconv.Atoi(after)
			if err != nil {
				return 0, fmt.Errorf("bad content length: %w", err)
			}
		}
	}
	return contentLength, nil
}

func (s *Server) handleMessage(body []byte) {
	var msg struct {
		Method string          `json:"method"`
		ID     json.RawMessage `json:"id"`
		Params json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal(body, &msg); err != nil {
		s.sendError(nil, -32700, "Parse error")
		return
	}

	pr := msg.Params
	if pr == nil {
		pr = []byte("null")
	}

	if msg.ID != nil {
		s.handleRequest(msg.ID, msg.Method, pr)
	} else {
		s.handleNotification(msg.Method, pr)
	}
}

func (s *Server) handleRequest(id json.RawMessage, method string, params []byte) {
	var result any
	var err error

	switch method {
	case "initialize":
		err = s.handleInitialize(params, &result)
	case "shutdown":
		result = struct{}{}
	default:
		if !s.initialized {
			err = fmt.Errorf("server not initialized")
			break
		}
		switch method {
		case "textDocument/hover":
			err = s.handleHover(params, &result)
		case "textDocument/inlayHint":
			err = s.handleInlayHint(params, &result)
		case "textDocument/codeLens":
			err = s.handleCodeLens(params, &result)
		case "textDocument/codeAction":
			err = s.handleCodeAction(params, &result)
		case "$/structData":
			err = s.handleStructData(params, &result)
		case "$/version":
			result = map[string]string{
				"version": version.Version,
				"commit":  version.Commit,
			}
		default:
			err = fmt.Errorf("method not found: %s", method)
		}
	}

	if err != nil {
		s.sendError(id, -32601, err.Error())
		return
	}

	s.sendResult(id, result)
}

func (s *Server) handleNotification(method string, params []byte) {
	switch method {
	case "initialized":
		s.initialized = true
	case "textDocument/didOpen":
		s.handleDidOpen(params)
	case "textDocument/didChange":
		s.handleDidChange(params)
	case "textDocument/didSave":
		s.handleDidSave(params)
	case "textDocument/didClose":
		s.handleDidClose(params)
	case "workspace/didChangeConfiguration":
		s.handleDidChangeConfiguration(params)
	}
}

func (s *Server) sendResult(id json.RawMessage, result any) {
	data, err := json.Marshal(result)
	if err != nil {
		s.sendError(id, -32603, fmt.Sprintf("marshal error: %v", err))
		return
	}

	resp := Response{
		Jsonrpc: "2.0",
		ID:      id,
		Result:  data,
	}
	s.writeMessage(resp)
}

func (s *Server) sendError(id json.RawMessage, code int, message string) {
	resp := Response{
		Jsonrpc: "2.0",
		ID:      id,
		Error: &ResponseError{
			Code:    code,
			Message: message,
		},
	}
	s.writeMessage(resp)
}

func (s *Server) sendNotification(method string, params any) {
	data, err := json.Marshal(params)
	if err != nil {
		return
	}

	notif := struct {
		Jsonrpc string          `json:"jsonrpc"`
		Method  string          `json:"method"`
		Params  json.RawMessage `json:"params"`
	}{
		Jsonrpc: "2.0",
		Method:  method,
		Params:  data,
	}
	s.writeMessage(notif)
}

func (s *Server) writeMessage(msg any) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(data))
	if _, err := s.writer.Write([]byte(header)); err != nil {
		return
	}
	if _, err := s.writer.Write(data); err != nil {
		return
	}
}
