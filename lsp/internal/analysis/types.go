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
	Name                string      `json:"name"`
	File                string      `json:"file"`
	Line                int         `json:"line"`
	TotalSize           int64       `json:"totalSize"`
	Alignment           int64       `json:"alignment"`
	PointerBytes        int64       `json:"pointerBytes"`
	OptimalPointerBytes int64       `json:"optimalPointerBytes"`
	OptimalSize         int64       `json:"optimalSize"`
	Fields              []FieldInfo `json:"fields"`
	OptimalFields       []FieldInfo `json:"optimalFields,omitempty"`
}

type AnalysisResult struct {
	Structs []StructInfo `json:"structs"`
	Arch    string       `json:"arch"`
	File    string       `json:"file"`
	Errors  []string     `json:"errors,omitempty"`
}
