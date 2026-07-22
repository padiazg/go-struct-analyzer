# GC Scan Range

The Go garbage collector must scan structs for pointers. It scans from offset 0 to the last pointer-containing byte — the **GC scan range**.

## Why field order matters

When pointer fields are scattered after non-pointer fields, the GC scans padding and non-pointer data between them. Grouping pointers at the start reduces the scan range.

## Pointer-containing types

These types contain at least one pointer word:

| Type | Pointer words | Reason |
| - | - | - |
| `*T` | 1 | Single pointer |
| `string` | 1 | Pointer to string data + length |
| `[]T` | 1 | Pointer to slice data + len + cap |
| `map[K]V` | 1 | Pointer to hash table |
| `chan T` | 1 | Pointer to channel |
| `func(...)` | 1 | Function pointer |
| `interface{}` | 2 | Type descriptor + data pointer |

## Example

```go
type Widget struct {
    a bool     // offset 0,  1 byte, no pointer
    b *string  // offset 8,  8 bytes (+7 padding), pointer!
    c int64    // offset 16, 8 bytes, no pointer
    d string   // offset 24, 16 bytes, pointer!
    // GC scan range: 40 bytes (from 0 to end of d)
}
```

With GC-optimal ordering:

```go
type Widget struct {
    b *string  // offset 0,  8 bytes, pointer!
    d string   // offset 8,  16 bytes, pointer!
    a bool     // offset 24, 1 byte,  no pointer
    c int64    // offset 32, 8 bytes, no pointer
    // GC scan range: 24 bytes (from 0 to end of d)
}
```

The GC scan range dropped from 40B to 24B — a 40% reduction.
