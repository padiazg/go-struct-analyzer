# Concepts

Understanding Go's memory layout rules is the foundation for optimizing structs.

## Overview

- [Memory Alignment](memory-alignment.md) — how Go aligns fields in memory, why padding exists, and how to minimize it
- [GC Scan Range](gc-scan.md) — how the garbage collector scans structs for pointers, and why field order matters
- [PtrData Calculation](ptrdata.md) — how the extension computes the exact GC scan byte range (v1.3.0+)

## Quick reference

| Concept | In a sentence |
| - | - |
| Alignment | Every field starts at a memory address multiple of its size (up to 8 bytes) |
| Padding | Empty bytes inserted to satisfy alignment — wasted space |
| GC scan | The GC only scans from offset 0 to the last pointer word |
| PtrData | Exact byte count from offset 0 to the last pointer in a type |
