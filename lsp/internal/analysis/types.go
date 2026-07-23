package analysis

type FieldInfo struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Size      int64  `json:"size"`
	Alignment int64  `json:"alignment"`
	Offset    int64  `json:"offset"`
	Padding   int64  `json:"padding"`
	Line      int    `json:"line,omitempty"`
}

type StructInfo struct {
	File                string      `json:"file"`
	Name                string      `json:"name"`
	Fields              []FieldInfo `json:"fields"`
	OptimalFields       []FieldInfo `json:"optimalFields,omitempty"`
	Alignment           int64       `json:"alignment"`
	Line                int         `json:"line"`
	OptimalPointerBytes int64       `json:"optimalPointerBytes"`
	OptimalSize         int64       `json:"optimalSize"`
	PointerBytes        int64       `json:"pointerBytes"`
	TotalSize           int64       `json:"totalSize"`
}

type AnalysisResult struct {
	Structs []StructInfo `json:"structs"`
	Arch    string       `json:"arch"`
	File    string       `json:"file"`
	Errors  []string     `json:"errors,omitempty"`
}
