package analysis

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"path/filepath"
	"sort"

	"golang.org/x/tools/go/packages"
)

func AnalyzeFile(filePath, arch string, src ...string) (*AnalysisResult, error) {
	sizes := types.SizesFor("gc", arch)
	if sizes == nil {
		return nil, fmt.Errorf("unsupported architecture: %s", arch)
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return nil, fmt.Errorf("resolving path: %w", err)
	}

	cfg := &packages.Config{
		Mode: packages.NeedTypes | packages.NeedSyntax | packages.NeedTypesInfo,
		Dir:  filepath.Dir(absPath),
	}
	if len(src) > 0 && src[0] != "" {
		cfg.Overlay = map[string][]byte{absPath: []byte(src[0])}
	}
	pkgs, err := packages.Load(cfg, "file="+absPath)
	if err != nil {
		return nil, fmt.Errorf("loading package: %w", err)
	}
	if len(pkgs) == 0 {
		return nil, fmt.Errorf("no package found for %s", absPath)
	}

	pkg := pkgs[0]
	if len(pkg.Errors) > 0 {
		errs := make([]string, len(pkg.Errors))
		for i, e := range pkg.Errors {
			errs[i] = e.Error()
		}
		return &AnalysisResult{File: absPath, Arch: arch, Errors: errs}, nil
	}

	targetFile := findTargetFile(pkg.Syntax, pkg.Fset, absPath)
	if targetFile == nil {
		return nil, fmt.Errorf("file %s not found in loaded package", absPath)
	}

	structs := analyzeFile(targetFile, pkg.Fset, pkg.Types, sizes)
	return &AnalysisResult{Structs: structs, Arch: arch, File: absPath}, nil
}

func findTargetFile(files []*ast.File, fset *token.FileSet, absPath string) *ast.File {
	for _, f := range files {
		if fset.Position(f.Pos()).Filename == absPath {
			return f
		}
	}
	targetBase := filepath.Base(absPath)
	for _, f := range files {
		if filepath.Base(fset.Position(f.Pos()).Filename) == targetBase {
			return f
		}
	}
	return nil
}

func analyzeFile(f *ast.File, fset *token.FileSet, pkg *types.Package, sizes types.Sizes) []StructInfo {
	var result []StructInfo

	for _, decl := range f.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, spec := range genDecl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			structType, ok := typeSpec.Type.(*ast.StructType)
			if !ok {
				continue
			}
			if structType.Fields == nil || len(structType.Fields.List) == 0 {
				continue
			}

			pos := fset.Position(typeSpec.Pos())
			si := analyzeStructType(typeSpec, structType, pkg, fset, sizes)
			si.File = pos.Filename
			si.Line = pos.Line
			result = append(result, si)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Line < result[j].Line
	})

	return result
}

func analyzeStructType(typeSpec *ast.TypeSpec, structType *ast.StructType, pkg *types.Package, fset *token.FileSet, sizes types.Sizes) StructInfo {
	si := StructInfo{Name: typeSpec.Name.Name}

	obj := pkg.Scope().Lookup(typeSpec.Name.Name)
	if obj == nil {
		return si
	}
	structObj, ok := obj.Type().Underlying().(*types.Struct)
	if !ok {
		return si
	}

	fields := computeLayout(structObj, sizes)
	si.Fields = layoutsToInfo(fields)
	si.TotalSize = structTotalSize(fields, sizes)
	si.Alignment = maxAlignment(fields)
	si.PointerBytes = pointerBytes(fields, sizes)

	opt := optimalFieldOrder(fields, sizes)
	opt = recomputeOffsets(opt)
	si.OptimalFields = layoutsToInfo(opt)
	si.OptimalPointerBytes = pointerBytes(opt, sizes)
	si.OptimalSize = structTotalSize(opt, sizes)

	// Map field line numbers from AST
	lineByField := make(map[string]int)
	fi := 0
	for _, field := range structType.Fields.List {
		for _, name := range field.Names {
			if fi < len(si.Fields) {
				si.Fields[fi].Line = fset.Position(field.Pos()).Line
				lineByField[name.Name] = si.Fields[fi].Line
				fi++
			}
		}
	}

	// Map line numbers to optimal fields
	for i := range si.OptimalFields {
		if line, ok := lineByField[si.OptimalFields[i].Name]; ok {
			si.OptimalFields[i].Line = line
		}
	}

	return si
}
