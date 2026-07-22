# PtrData Calculation

The `ptrdata` of a type is the number of bytes the garbage collector must scan, from offset 0 to the last pointer word. This matches the semantics of `gcSizes.ptrdata()` from Go's `fieldalignment` analysis.

## How it works

For simple types:

- **Pointer** (`*T`, `map[K]V`, `chan T`, `func(...)`): returns `ptrSize` (8 on amd64)
- **Interface** (`interface{}`, `any`): returns `2 * ptrSize` (two pointer words)
- **String**: returns `ptrSize` (data pointer at offset 0, length at offset ptrSize)
- **Slice**: returns `ptrSize` (data pointer at offset 0)
- **Numeric/bool**: returns 0 (no pointers)

For arrays `[N]T`:

```
ptrdata = (N - 1) * sizeof(T) + ptrdata(T)
```

When the element type has no pointers, the result is 0. When it has pointers, the GC must scan the entire array except the last element's tail.

For structs, ptrdata is computed by walking fields in order and tracking the highest end of a pointer range:

```
for each field:
    ptrdata = max(ptrdata, field_offset + getPtrData(field.type))
```

This is done recursively through embedded struct fields.

## Standard library type seeding

Some common stdlib types are seeded with exact ptrdata values:

| Type | Size | PtrData |
| - | - | - |
| `time.Time` | 24 | 8 |
| `reflect.Value` | 24 | 8 |
| `reflect.Type` | 16 | 16 |
| `token.Position` | 40 | 8 |

These no longer fall through to conservative pointer-sized estimates.

## What changed in v1.3.0

Prior to v1.3.0, pointer classification used a ternary system (`pure`/`mixed`/`none`) that lost information:

- Arrays collapsed to `mixed` regardless of size → now computes exact byte ranges
- Embedded structs inherited binary pointer class → now compute byte-accurate ptrdata through fields
- Unrecognized types fell back to one pointer word estimate → stdlib types now exact
