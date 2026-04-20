import * as vscode from 'vscode';
import { GoStruct, GoField } from './parser';

export interface FieldAnalysis {
    name: string;
    type: string;
    size: number;
    alignment: number;
    offset: number;
    padding: number;
}

export interface StructAnalysis {
    name: string;
    fields: FieldAnalysis[];
    totalSize: number;
    alignment: number;
}

export class StructAnalyzer {
    private readonly typeSizes: Map<string, { size: number; alignment: number }>;
    private architecture: string;
    private structRegistry = new Map<string, GoStruct>();

    constructor() {
        this.architecture = this.getArchitecture();
        this.typeSizes = this.initializeTypeSizes();
    }

    // Call this once per document parse so analyzeStruct can resolve embedded struct sizes.
    setStructRegistry(structs: GoStruct[]): void {
        this.structRegistry.clear();
        for (const s of structs) {
            this.structRegistry.set(s.name, s);
        }
    }

    private getPtrSize(): number {
        return this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
    }

    private getArchitecture(): string {
        const config = vscode.workspace.getConfiguration('goStructAnalyzer');
        return config.get<string>('architecture') || 'amd64';
    }

    private initializeTypeSizes(): Map<string, { size: number; alignment: number }> {
        const sizes = new Map();
        const is64Bit = this.architecture === 'amd64' || this.architecture === 'arm64';
        const ptrSize = is64Bit ? 8 : 4;

        // Basic types
        sizes.set('bool', { size: 1, alignment: 1 });
        sizes.set('int8', { size: 1, alignment: 1 });
        sizes.set('uint8', { size: 1, alignment: 1 });
        sizes.set('byte', { size: 1, alignment: 1 });
        sizes.set('int16', { size: 2, alignment: 2 });
        sizes.set('uint16', { size: 2, alignment: 2 });
        sizes.set('int32', { size: 4, alignment: 4 });
        sizes.set('uint32', { size: 4, alignment: 4 });
        sizes.set('rune', { size: 4, alignment: 4 });
        sizes.set('int64', { size: 8, alignment: 8 });
        sizes.set('uint64', { size: 8, alignment: 8 });
        sizes.set('float32', { size: 4, alignment: 4 });
        sizes.set('float64', { size: 8, alignment: 8 });
        sizes.set('complex64', { size: 8, alignment: 4 });
        sizes.set('complex128', { size: 16, alignment: 8 });

        // Architecture-dependent types
        sizes.set('int', { size: ptrSize, alignment: ptrSize });
        sizes.set('uint', { size: ptrSize, alignment: ptrSize });
        sizes.set('uintptr', { size: ptrSize, alignment: ptrSize });

        // Reference types (pointers, slices, maps, channels, interfaces)
        sizes.set('string', { size: ptrSize * 2, alignment: ptrSize }); // ptr + len
        
        return sizes;
    }

    analyzeStruct(goStruct: GoStruct): StructAnalysis {
        return this.analyzeStructInternal(goStruct, new Set<string>());
    }

    private analyzeStructInternal(goStruct: GoStruct, visited: Set<string>): StructAnalysis {
        const fields: FieldAnalysis[] = [];
        let currentOffset = 0;
        let maxAlignment = 1;

        for (const field of goStruct.fields) {
            const typeInfo = this.getTypeInfo(field.type, visited);
            maxAlignment = Math.max(maxAlignment, typeInfo.alignment);

            const padding = this.calculatePadding(currentOffset, typeInfo.alignment);
            currentOffset += padding;

            fields.push({
                name: field.name,
                type: field.type,
                size: typeInfo.size,
                alignment: typeInfo.alignment,
                offset: currentOffset,
                padding: padding
            });

            currentOffset += typeInfo.size;
        }

        const finalPadding = this.calculatePadding(currentOffset, maxAlignment);
        const totalSize = currentOffset + finalPadding;

        return {
            name: goStruct.name,
            fields: fields,
            totalSize: totalSize,
            alignment: maxAlignment
        };
    }

    private getTypeInfo(type: string, visited?: Set<string>): { size: number; alignment: number } {
        const cleanType = type.replace(/^\*+/, '');
        const ptrSize = this.getPtrSize();

        if (type.startsWith('*')) {
            return { size: ptrSize, alignment: ptrSize };
        }

        if (cleanType.startsWith('[]')) {
            return { size: ptrSize * 3, alignment: ptrSize }; // ptr + len + cap
        }

        const arrayMatch = cleanType.match(/^\[(\d+)\](.+)/);
        if (arrayMatch) {
            const length = parseInt(arrayMatch[1]);
            const elementInfo = this.getTypeInfo(arrayMatch[2], visited);
            return { size: length * elementInfo.size, alignment: elementInfo.alignment };
        }

        if (cleanType.startsWith('map[') || cleanType.startsWith('chan ')) {
            return { size: ptrSize, alignment: ptrSize };
        }

        if (cleanType === 'interface{}' || cleanType.startsWith('interface{')) {
            return { size: ptrSize * 2, alignment: ptrSize }; // type + data pointers
        }

        if (cleanType.startsWith('func(')) {
            return { size: ptrSize, alignment: ptrSize };
        }

        const basicType = this.typeSizes.get(cleanType);
        if (basicType) {
            return basicType;
        }

        // Unknown type: look up in the struct registry (handles embedded / named structs).
        // Strip a package qualifier if present (e.g. "pkg.Type" → "Type").
        const baseName = cleanType.includes('.') ? cleanType.split('.').pop()! : cleanType;
        const registered = this.structRegistry.get(baseName);
        if (registered && !visited?.has(baseName)) {
            const childVisited = new Set(visited);
            childVisited.add(baseName);
            const analysis = this.analyzeStructInternal(registered, childVisited);
            return { size: analysis.totalSize, alignment: analysis.alignment };
        }

        // Fallback: treat as a pointer-sized opaque type
        return { size: ptrSize, alignment: ptrSize };
    }

    private calculatePadding(currentOffset: number, alignment: number): number {
        const remainder = currentOffset % alignment;
        return remainder === 0 ? 0 : alignment - remainder;
    }

    getFieldSizeString(field: GoField, analysis?: FieldAnalysis): string {
        if (analysis) {
            return `${analysis.size}B`;
        }
        
        const typeInfo = this.getTypeInfo(field.type, new Set<string>());
        return `${typeInfo.size}B`;
    }

    getTotalStructSize(goStruct: GoStruct): number {
        const analysis = this.analyzeStruct(goStruct);
        return analysis.totalSize;
    }

    getOptimalStructSize(goStruct: GoStruct): number {
        const optimizedFields = this.getOptimalFieldOrder(goStruct.fields);
        const optimizedStruct: GoStruct = {
            ...goStruct,
            fields: optimizedFields
        };
        const analysis = this.analyzeStruct(optimizedStruct);
        return analysis.totalSize;
    }

    getOptimalFieldOrder(fields: GoField[]): GoField[] {
        const fieldsWithInfo = fields.map(field => ({
            field,
            typeInfo: this.getTypeInfo(field.type, new Set<string>())
        }));

        fieldsWithInfo.sort((a, b) => {
            if (a.typeInfo.alignment !== b.typeInfo.alignment) {
                return b.typeInfo.alignment - a.typeInfo.alignment;
            }
            if (a.typeInfo.size !== b.typeInfo.size) {
                return b.typeInfo.size - a.typeInfo.size;
            }
            return a.field.name.localeCompare(b.field.name);
        });

        return fieldsWithInfo.map(item => item.field);
    }

    computeOptimalLayout(goStruct: GoStruct): StructAnalysis {
        const optimizedFields = this.getOptimalFieldOrder(goStruct.fields);
        return this.analyzeStruct({ ...goStruct, fields: optimizedFields });
    }

    canOptimizeStruct(goStruct: GoStruct): boolean {
        const currentSize = this.getTotalStructSize(goStruct);
        const optimalSize = this.getOptimalStructSize(goStruct);
        return optimalSize < currentSize;
    }

    // Returns whether a type contains GC-tracked pointers and how:
    //   'pure'  — every word in the field is a pointer (map, chan, func, *T, interface{})
    //   'mixed' — first word is a pointer, rest are not (string, slice)
    //   'none'  — no pointer words (numeric types, bool, arrays of non-pointer types)
    getPointerClass(type: string, visited: Set<string> = new Set<string>()): 'pure' | 'mixed' | 'none' {
        if (type.startsWith('*')) return 'pure';

        const clean = type.trim();

        if (clean.startsWith('map[') || clean.startsWith('chan ') || clean === 'chan') return 'pure';
        if (clean.startsWith('func(')) return 'pure';
        if (clean === 'interface{}' || clean === 'any' || clean.startsWith('interface{')) return 'pure';

        if (clean === 'string') return 'mixed';
        if (clean.startsWith('[]')) return 'mixed';

        const arrayMatch = clean.match(/^\[(\d+)\](.+)/);
        if (arrayMatch) {
            const elemClass = this.getPointerClass(arrayMatch[2], visited);
            return elemClass === 'none' ? 'none' : 'mixed';
        }

        if (this.typeSizes.has(clean)) return 'none';

        // Unknown / embedded struct: look up registry to determine pointer content.
        const baseName = clean.includes('.') ? clean.split('.').pop()! : clean;
        return this.getPointerClassOfStruct(baseName, visited);
    }

    // Recursively checks if a registered struct type contains any pointer words.
    // Returns 'none' only when every field (transitively) has no pointers.
    private getPointerClassOfStruct(name: string, visited: Set<string>): 'pure' | 'mixed' | 'none' {
        if (visited.has(name)) return 'none'; // cycle guard
        const struct = this.structRegistry.get(name);
        if (!struct) return 'mixed'; // not in registry → conservative

        const childVisited = new Set(visited);
        childVisited.add(name);

        for (const field of struct.fields) {
            if (this.getPointerClass(field.type, childVisited) !== 'none') {
                return 'mixed';
            }
        }
        return 'none';
    }

    // Number of bytes the GC must scan in the current field order.
    // Equals the end offset of the last pointer-containing word.
    calculatePointerBytes(goStruct: GoStruct): number {
        const analysis = this.analyzeStruct(goStruct);
        let lastPtrEnd = 0;

        for (const field of analysis.fields) {
            const cls = this.getPointerClass(field.type);
            if (cls === 'none') continue;

            if (cls === 'pure') {
                // All words in this field are pointer words
                lastPtrEnd = Math.max(lastPtrEnd, field.offset + field.size);
            } else {
                // 'mixed': only the first 8-byte word is a pointer
                lastPtrEnd = Math.max(lastPtrEnd, field.offset + 8);
            }
        }

        return lastPtrEnd;
    }

    // Reorder fields to minimise the GC scan range:
    //   1. alignment DESC          (avoid padding)
    //   2. pointer class: pure → mixed → none
    //   3. within mixed: size ASC  (fewer trailing non-ptr words before next ptr field)
    //   4. within pure/none: size DESC
    //   5. name ASC
    getOptimalPointerOrder(fields: GoField[]): GoField[] {
        const clsRank: Record<string, number> = { pure: 0, mixed: 1, none: 2 };

        return [...fields].sort((a, b) => {
            const aInfo = this.getTypeInfo(a.type, new Set<string>());
            const bInfo = this.getTypeInfo(b.type, new Set<string>());
            const aCls  = this.getPointerClass(a.type);
            const bCls  = this.getPointerClass(b.type);

            if (aInfo.alignment !== bInfo.alignment) {
                return bInfo.alignment - aInfo.alignment;
            }

            if (clsRank[aCls] !== clsRank[bCls]) {
                return clsRank[aCls] - clsRank[bCls];
            }

            if (aCls === 'mixed' && aInfo.size !== bInfo.size) {
                return aInfo.size - bInfo.size; // ASC for mixed
            }

            if (aInfo.size !== bInfo.size) {
                return bInfo.size - aInfo.size; // DESC for pure / none
            }

            return a.name.localeCompare(b.name);
        });
    }

    computeGCOptimalLayout(goStruct: GoStruct): StructAnalysis {
        const optimalFields = this.getOptimalPointerOrder(goStruct.fields);
        return this.analyzeStruct({ ...goStruct, fields: optimalFields });
    }

    getOptimalPointerBytes(goStruct: GoStruct): number {
        const optimalFields = this.getOptimalPointerOrder(goStruct.fields);
        return this.calculatePointerBytes({ ...goStruct, fields: optimalFields });
    }

    canReducePointerBytes(goStruct: GoStruct): boolean {
        const current = this.calculatePointerBytes(goStruct);
        if (current === 0) return false;
        return this.getOptimalPointerBytes(goStruct) < current;
    }
}