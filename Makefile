MODULE   := $(shell head -1 lsp/go.mod | awk '{print $$2}')
BINARY   := gsa-lsp
VERSION_PKG := $(MODULE)/internal/version

LDFLAGS  := -X $(VERSION_PKG).version=$(shell git describe --tags --always --dirty)
LDFLAGS  += -X $(VERSION_PKG).commit=$(shell git rev-parse HEAD)
LDFLAGS  += -X $(VERSION_PKG).buildDate=$(shell date -Iseconds)

GOPATH := $(shell go env GOPATH)

.PHONY: build build-go build-ts test lint vet fmt clean mod-tidy install coverage preflight help

build: build-go build-ts

build-go:
	@echo "Building $(BINARY)..."
	@cd lsp && go build -o ../$(BINARY) -ldflags "$(LDFLAGS)" ./cmd/gsa-lsp/

build-ts:
	@echo "Compiling TypeScript..."
	@npm run compile

test:
	cd lsp && go test -race -count=1 ./...

lint:
	cd lsp && golangci-lint run ./...

vet:
	cd lsp && go vet ./...

fmt:
	cd lsp && gofmt -s -w .

clean:
	rm -f $(BINARY) coverage.out
	rm -rf out/

mod-tidy:
	cd lsp && go mod tidy

install: build-go
	cp $(BINARY) $(GOPATH)/bin/

coverage:
	cd lsp && go test -race -coverprofile=coverage.out ./... && go tool cover -func=coverage.out

preflight: vet fmt lint test

help:
	@echo "build     - compile Go binary + TypeScript"
	@echo "build-go  - compile gsa-lsp binary only"
	@echo "build-ts  - compile TypeScript only"
	@echo "test      - run Go tests with race detector"
	@echo "lint      - run golangci-lint"
	@echo "vet       - run go vet"
	@echo "fmt       - format Go source"
	@echo "clean     - remove build artifacts"
	@echo "mod-tidy  - tidy lsp/go.mod"
	@echo "install   - build + copy to GOPATH/bin"
	@echo "coverage  - generate coverage report"
	@echo "preflight - vet + fmt + lint + test"
	@echo "help      - show this help"
