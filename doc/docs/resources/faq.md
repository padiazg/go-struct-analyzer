# FAQ

## Why does field order matter for struct size?

Go aligns fields to their natural alignment boundary. If a field with large alignment (e.g. `int64`, 8 bytes) follows a small field (e.g. `bool`, 1 byte), the compiler inserts padding bytes between them. Ordering fields by decreasing alignment minimizes this padding.

## What's the difference between Size-Optimal and GC-Optimal?

**Size-Optimal** minimizes total bytes by sorting fields by alignment descending. **GC-Optimal** minimizes the GC scan range by grouping pointer-containing fields first, which may not always produce the smallest total size.

These goals can conflict — the extension shows both so you can choose.

## Does the extension modify my source files?

Only when you explicitly trigger the quick fix (lightbulb or `Ctrl+.`). The extension is read-only otherwise.

## What architectures are supported?

amd64, 386, arm64, and arm. Select via the `goStructAnalyzer.architecture` setting.

## Does this work with generics?

Yes. Generic structs like `type Foo[T any] struct` are supported.

## Are embedded structs supported?

Yes. The extension resolves the real size and alignment of named/embedded struct types defined in the same file. Pointer content from embedded structs is correctly classified.

## How accurate are the sizes?

Sizes match Go's `unsafe.Sizeof()` for all supported types. The extension implements Go's memory layout algorithm and has been validated against the `fieldalignment` analysis pass.
