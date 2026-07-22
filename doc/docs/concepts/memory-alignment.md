# Memory Alignment

Go aligns struct fields to their natural alignment boundary. Understanding this explains why field order affects struct size.

## Rules

1. Each field is aligned to its natural alignment boundary (typically its size, capped at the platform pointer size)
2. Struct alignment is the largest alignment of any field
3. The struct is padded to a multiple of its alignment

## Alignment by type

| Type | Alignment |
| - | - |
| `bool`, `int8`, `uint8`, `byte` | 1 byte |
| `int16`, `uint16` | 2 bytes |
| `int32`, `uint32`, `float32`, `rune` | 4 bytes |
| `int64`, `uint64`, `float64` | 8 bytes |
| `complex64` | 4 bytes |
| `complex128` | 8 bytes |
| pointers (`*T`), `string`, `[]T`, `map[K]V`, `chan T`, `func(...)` | pointer size (8 on amd64, 4 on 386) |

## Example

```go
type Example struct {
    A int8    // 1 byte at offset 0
    // 7 bytes padding here
    B int64   // 8 bytes at offset 8
    C int8    // 1 byte at offset 16
    // 7 bytes padding here
    D int64   // 8 bytes at offset 24
    // Total: 32 bytes (not 18!)
}
```

## Optimal ordering

Place fields with larger alignment first:

```go
type Example struct {
    B int64   // 8 bytes at offset 0
    D int64   // 8 bytes at offset 8
    A int8    // 1 byte at offset 16
    C int8    // 1 byte at offset 17
    // 6 bytes padding here
    // Total: 24 bytes
}
```

## Architecture differences

- **amd64/arm64**: pointers and `int`/`uint` are 8 bytes
- **386/arm**: pointers and `int`/`uint` are 4 bytes

Configuring the correct architecture in settings ensures accurate calculations.
