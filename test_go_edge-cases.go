package testcases

// =============================================================================
// CASO 1: Struct ya óptimo — NO debe ofrecer code action
// =============================================================================
// Layout actual:  int64(8) + int32(4) + int16(2) + bool(1) + bool(1) = 16 bytes
// Layout óptimo: igual — ya está ordenado por alignment DESC
type AlreadyOptimal struct {
	Timestamp int64
	Score     int32
	Count     int16
	Active    bool
	Deleted   bool
}

// =============================================================================
// CASO 2: Caso clásico de padding ineficiente — DEBE ofrecer code action
// =============================================================================
// Layout actual:
//   Active   bool    → offset 0,  size 1,  align 1  → +7 padding
//   Score    int64   → offset 8,  size 8,  align 8
//   Deleted  bool    → offset 16, size 1,  align 1  → +7 padding
//   Count    int64   → offset 24, size 8,  align 8
//   Total: 32 bytes
//
// Layout óptimo:
//   Score    int64   → offset 0,  size 8
//   Count    int64   → offset 8,  size 8
//   Active   bool    → offset 16, size 1
//   Deleted  bool    → offset 17, size 1  → +6 padding
//   Total: 24 bytes  (ahorra 8 bytes)
type ClassicBadLayout struct {
	Active  bool
	Score   int64
	Deleted bool
	Count   int64
}

// =============================================================================
// CASO 3: Struct con un solo campo — NO debe ofrecer code action
// =============================================================================
type SingleField struct {
	Value int64
}

// =============================================================================
// CASO 4: Struct vacío — NO debe ofrecer code action
// =============================================================================
type Empty struct{}

// =============================================================================
// CASO 5: Struct con campos embebidos — embebidos NO deben moverse
// =============================================================================
// Regla: los campos embebidos (sin nombre explícito) mantienen su posición
// relativa entre ellos. Solo se reordenan los campos con nombre explícito.
//
// Layout actual:
//   Base     BaseModel  → offset 0, size 16 (hipotético), align 8
//   Active   bool       → offset 16, size 1, align 1  → +7 padding
//   Score    int64      → offset 24, size 8, align 8
//   Total: 32 bytes
//
// Layout óptimo:
//   Base     BaseModel  → offset 0, size 16, align 8  (no se mueve)
//   Score    int64      → offset 16, size 8, align 8
//   Active   bool       → offset 24, size 1, align 1  → +7 padding
//   Total: 32 bytes  (en este caso igual, pero el orden de los nombrados cambia)
type BaseModel struct {
	ID        uint64
	CreatedAt int64
}

type WithEmbedded struct {
	BaseModel        // campo embebido — NO mover
	Active    bool   // campo con nombre — puede moverse
	Score     int64  // campo con nombre — puede moverse
	Label     string // campo con nombre — puede moverse
}

// =============================================================================
// CASO 6: Struct con struct tags — tags deben preservarse con su campo
// =============================================================================
// Al reordenar, el campo y su tag van juntos.
// Layout actual:
//   ID       uint64  → offset 0,  size 8  (ya óptimo, no se mueve)
//   Active   bool    → offset 8,  size 1  → +3 padding
//   Score    int32   → offset 12, size 4
//   Name     string  → offset 16, size 16
//   Total: 32 bytes
//
// Layout óptimo:
//   ID       uint64  → offset 0,  size 8
//   Name     string  → offset 8,  size 16
//   Score    int32   → offset 24, size 4
//   Active   bool    → offset 28, size 1  → +3 padding
//   Total: 32 bytes  (mismo tamaño en este caso, pero orden diferente)
//
// IMPORTANTE: verificar que `json:"active" db:"active"` se mantiene con Active
type WithStructTags struct {
	ID     uint64 `json:"id"     db:"id"      validate:"required"`
	Active bool   `json:"active" db:"active"`
	Score  int32  `json:"score"  db:"score"`
	Name   string `json:"name"   db:"name"    validate:"required,max=255"`
}

// =============================================================================
// CASO 7: Struct con comentarios inline — comentarios deben preservarse
// =============================================================================
// Al reordenar, el comentario al final de la línea va con su campo.
type WithInlineComments struct {
	Active    bool   // indica si el usuario está activo
	Score     int64  // puntuación acumulada
	Deleted   bool   // soft delete flag
	UpdatedAt int64  // unix timestamp de última modificación
	Name      string // nombre completo del usuario
}

// =============================================================================
// CASO 8: Struct con tags Y comentarios inline — ambos deben preservarse
// =============================================================================
type WithTagsAndComments struct {
	ID        uint64 `json:"id"`        // primary key, autoincrement
	Active    bool   `json:"active"`    // soft enable/disable
	CreatedAt int64  `json:"created_at"` // unix timestamp
	Score     int32  `json:"score"`     // ranking score
	Name      string `json:"name"`      // display name
}

// =============================================================================
// CASO 9: Múltiples structs en el mismo archivo
// =============================================================================
// El code action sobre BadOne NO debe afectar a GoodOne ni a OtherBad
type BadOne struct {
	A bool
	B int64
	C bool
}

type GoodOne struct {
	B int64
	A bool
	C bool
}

type OtherBad struct {
	X bool
	Y int64
}

// =============================================================================
// CASO 10: Struct con punteros — punteros son 8 bytes en amd64
// =============================================================================
// Layout actual:
//   Active   bool     → offset 0,  size 1,  align 1  → +7 padding
//   Next     *Node    → offset 8,  size 8,  align 8
//   Value    int32    → offset 16, size 4,  align 4  → +4 padding
//   Total: 24 bytes
//
// Layout óptimo:
//   Next     *Node    → offset 0,  size 8,  align 8
//   Value    int32    → offset 8,  size 4,  align 4
//   Active   bool     → offset 12, size 1,  align 1  → +3 padding
//   Total: 16 bytes  (ahorra 8 bytes)
type Node struct {
	Active bool
	Next   *Node
	Value  int32
}

// =============================================================================
// CASO 11: Struct con slice y map — ambos son 24 y 8 bytes respectivamente
// =============================================================================
// Sizes en amd64:
//   []T     → 24 bytes (ptr + len + cap), align 8
//   map[K]V → 8 bytes (ptr), align 8
//   string  → 16 bytes (ptr + len), align 8
//
// Layout actual: ineficiente por bool intercalado
type WithCompositeTypes struct {
	Active  bool
	Tags    []string
	Deleted bool
	Meta    map[string]string
	Name    string
}

// Layout óptimo esperado:
// Tags    []string          → offset 0,  size 24
// Meta    map[string]string → offset 24, size 8
// Name    string            → offset 32, size 16
// Active  bool              → offset 48, size 1
// Deleted bool              → offset 49, size 1  → +6 padding
// Total: 56 bytes

// =============================================================================
// CASO 12: Struct con array fijo
// =============================================================================
// [32]byte → size 32, align 1
// [4]int64 → size 32, align 8
//
// Layout actual:
//   ID      uint64    → offset 0,  size 8,  align 8
//   Hash    [32]byte  → offset 8,  size 32, align 1
//   Active  bool      → offset 40, size 1,  align 1  → +7 padding
//   Scores  [4]int64  → offset 48, size 32, align 8
//   Total: 80 bytes
//
// Layout óptimo:
//   Scores  [4]int64  → offset 0,  size 32, align 8
//   ID      uint64    → offset 32, size 8,  align 8
//   Hash    [32]byte  → offset 40, size 32, align 1
//   Active  bool      → offset 72, size 1,  align 1  → +7 padding
//   Total: 80 bytes  (mismo — el array [32]byte con align 1 no mejora mucho)
type WithArrays struct {
	ID     uint64
	Hash   [32]byte
	Active bool
	Scores [4]int64
}

// =============================================================================
// CASO 13: Struct genérico (Go 1.18+) — el parser NO debe romperse
// =============================================================================
// El type parameter [T any] no debe interferir con el análisis del struct
type GenericPair[T any] struct {
	Active bool
	Value  T
	Score  int64
}

// =============================================================================
// CASO 14: Struct anidado (struct como tipo de campo)
// =============================================================================
// El campo de tipo struct se trata como opaco — se usa su size/align total.
// NO se analiza el struct interno en este contexto (tiene su propio análisis).
type Address struct {
	ZipCode int32
	Country bool // bool intercalado → Address mismo es subóptimo
	City    string
}

type Person struct {
	Active  bool    // bool antes de struct → ineficiente
	Addr    Address // size = 32 (hipotético), align = 8
	Score   int64
}

// =============================================================================
// CASO 15: Struct con interface{}
// =============================================================================
// interface{} → 16 bytes (type ptr + value ptr), align 8
//
// Layout actual:
//   Active bool        → offset 0,  size 1,  align 1  → +7 padding
//   Data   interface{} → offset 8,  size 16, align 8
//   ID     uint32      → offset 24, size 4,  align 4  → +4 padding
//   Total: 32 bytes
//
// Layout óptimo:
//   Data   interface{} → offset 0,  size 16, align 8
//   ID     uint32      → offset 16, size 4,  align 4
//   Active bool        → offset 20, size 1,  align 1  → +3 padding
//   Total: 24 bytes  (ahorra 8 bytes)
type WithInterface struct {
	Active bool
	Data   interface{}
	ID     uint32
}

// =============================================================================
// CASO 16: Struct con canal y función
// =============================================================================
// chan T    → 8 bytes, align 8
// func(...) → 8 bytes, align 8
//
// Layout actual:
//   Done     chan struct{} → offset 0,  size 8, align 8
//   Active   bool         → offset 8,  size 1, align 1  → +7 padding
//   Handler  func(int)    → offset 16, size 8, align 8
//   Total: 24 bytes
//
// Layout óptimo:
//   Done     chan struct{} → offset 0,  size 8, align 8
//   Handler  func(int)    → offset 8,  size 8, align 8
//   Active   bool         → offset 16, size 1, align 1  → +7 padding
//   Total: 24 bytes  (mismo total, pero Active al final)
type WithChanAndFunc struct {
	Done    chan struct{}
	Active  bool
	Handler func(int)
}
