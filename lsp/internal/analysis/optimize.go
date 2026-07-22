package analysis

import (
	"go/types"
	"sort"
)

// optimalFieldOrder sorts fields matching fieldalignment's optimalOrder():
//  1. zero-sized fields first
//  2. alignment DESC
//  3. pointer-bearing before pointer-free (ptrdata > 0 first)
//  4. within pointer-bearing: trailing non-pointer bytes ASC (size - ptrdata)
//  5. size DESC
//  6. name ASC
func optimalFieldOrder(fields []fieldLayout, sizes types.Sizes) []fieldLayout {
	sorted := make([]fieldLayout, len(fields))
	copy(sorted, fields)

	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]

		// 1. zero-sized fields first
		aZero := b2i(a.Size == 0)
		bZero := b2i(b.Size == 0)
		if aZero != bZero {
			return aZero < bZero
		}

		// 2. alignment DESC
		if a.Alignment != b.Alignment {
			return a.Alignment > b.Alignment
		}

		aPtr := ptrdata(a.TypeObj, sizes)
		bPtr := ptrdata(b.TypeObj, sizes)

		// 3. pointer-bearing before pointer-free
		aPtrFlag := b2i(aPtr > 0)
		bPtrFlag := b2i(bPtr > 0)
		if aPtrFlag != bPtrFlag {
			return aPtrFlag > bPtrFlag
		}

		// 4. within pointer-bearing: trailing non-pointer bytes ASC
		if aPtr > 0 && bPtr > 0 {
			aTrailing := a.Size - aPtr
			bTrailing := b.Size - bPtr
			if aTrailing != bTrailing {
				return aTrailing < bTrailing
			}
		}

		// 5. size DESC
		if a.Size != b.Size {
			return a.Size > b.Size
		}

		// 6. name ASC
		return a.Name < b.Name
	})

	return sorted
}

// type reorderableField struct {
// 	layout fieldLayout
// 	idx    int
// }

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
