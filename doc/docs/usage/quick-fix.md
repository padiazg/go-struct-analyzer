# Quick Fix: Reorder Struct Fields

When a struct has an optimization warning, a lightbulb appears. Apply the fix in one of three ways:

- Click the lightbulb icon next to the struct name
- Press `Ctrl+.` / `Cmd+.` with the cursor on the struct
- Open the Command Palette and choose "Quick Fix..."

## Memory Layout Fix

**Reorder struct fields to optimize memory layout** — places fields with larger alignment requirements first, minimizing padding.

## GC Scan Fix

**Reorder struct fields to reduce GC scan range** — groups pointer-containing fields toward the front, reducing the bytes the garbage collector must scan.

## What gets preserved

- Struct tags (`` `json:"..."` ``)
- Inline comments (`// comment`)
- Leading comments (comments above fields)
- Indentation style

## When the fix is NOT offered

- The struct is already optimally ordered
- The struct has only one field
- All fields are embedded (anonymous)
