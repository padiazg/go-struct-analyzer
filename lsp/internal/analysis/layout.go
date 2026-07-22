package analysis

import (
	"go/types"
)

type fieldLayout struct {
	Name      string
	TypeStr   string
	TypeObj   types.Type
	Size      int64
	Alignment int64
	Offset    int64
	Padding   int64
}

func computeLayout(structObj *types.Struct, sizes types.Sizes) []fieldLayout {
	var fields []fieldLayout
	offset := int64(0)

	for f := range structObj.Fields() {
		f := f
		ft := f.Type()

		// Skip type parameters (generics) — no concrete size
		if isTypeParam(ft) {
			continue
		}

		sz := sizes.Sizeof(ft)
		align := sizes.Alignof(ft)

		pad := padding(offset, align)
		offset += pad

		fields = append(fields, fieldLayout{
			Name:      f.Name(),
			TypeStr:   typeString(ft),
			TypeObj:   ft,
			Size:      sz,
			Alignment: align,
			Offset:    offset,
			Padding:   pad,
		})

		offset += sz
	}

	return fields
}

func isTypeParam(t types.Type) bool {
	switch t.(type) {
	case *types.TypeParam:
		return true
	}
	return false
}

func recomputeOffsets(fields []fieldLayout) []fieldLayout {
	out := make([]fieldLayout, len(fields))
	offset := int64(0)
	for i, f := range fields {
		pad := padding(offset, f.Alignment)
		offset += pad
		out[i] = f
		out[i].Offset = offset
		out[i].Padding = pad
		offset += f.Size
	}
	return out
}

func layoutsToInfo(fields []fieldLayout) []FieldInfo {
	info := make([]FieldInfo, len(fields))
	for i, f := range fields {
		info[i] = FieldInfo{
			Name:      f.Name,
			Type:      f.TypeStr,
			Size:      f.Size,
			Alignment: f.Alignment,
			Offset:    f.Offset,
			Padding:   f.Padding,
		}
	}
	return info
}

func structTotalSize(fields []fieldLayout, sizes types.Sizes) int64 {
	if len(fields) == 0 {
		return 0
	}
	last := fields[len(fields)-1]
	end := last.Offset + last.Size
	maxAlign := maxAlignment(fields)
	return alignUp(end, maxAlign)
}

func pointerBytes(fields []fieldLayout, sizes types.Sizes) int64 {
	lastPtrEnd := int64(0)
	for _, f := range fields {
		if isTypeParam(f.TypeObj) {
			continue
		}
		pd := ptrdata(f.TypeObj, sizes)
		if pd > 0 {
			end := f.Offset + pd
			if end > lastPtrEnd {
				lastPtrEnd = end
			}
		}
	}
	return lastPtrEnd
}

func maxAlignment(fields []fieldLayout) int64 {
	maxAlign := int64(1)
	for _, f := range fields {
		if f.Alignment > maxAlign {
			maxAlign = f.Alignment
		}
	}
	return maxAlign
}

func padding(offset, alignment int64) int64 {
	if alignment <= 1 {
		return 0
	}
	rem := offset % alignment
	if rem == 0 {
		return 0
	}
	return alignment - rem
}

func alignUp(v, align int64) int64 {
	if align <= 1 {
		return v
	}
	rem := v % align
	if rem == 0 {
		return v
	}
	return v + align - rem
}

func typeString(t types.Type) string {
	return t.String()
}

func ptrdata(t types.Type, sizes types.Sizes) int64 {
	t = t.Underlying()

	switch typ := t.(type) {
	case *types.Pointer:
		return 8

	case *types.Interface:
		return 16

	case *types.Slice:
		return 8

	case *types.Map:
		return 8

	case *types.Chan:
		return 8

	case *types.Signature:
		return 8

	case *types.Basic:
		if typ.Info()&types.IsString != 0 {
			return 8
		}
		return 0

	case *types.Array:
		elemPtr := ptrdata(typ.Elem(), sizes)
		if elemPtr == 0 {
			return 0
		}
		elemSize := sizes.Sizeof(typ.Elem())
		return (typ.Len()-1)*elemSize + elemPtr

	case *types.Struct:
		lastPtrEnd := int64(0)
		offset := int64(0)
		for f := range typ.Fields() {
			f := f
			ft := f.Type()
			sz := sizes.Sizeof(ft)
			align := sizes.Alignof(ft)
			pad := padding(offset, align)
			offset += pad
			pd := ptrdata(ft, sizes)
			if pd > 0 {
				end := offset + pd
				if end > lastPtrEnd {
					lastPtrEnd = end
				}
			}
			offset += sz
		}
		return lastPtrEnd

	default:
		return 0
	}
}
