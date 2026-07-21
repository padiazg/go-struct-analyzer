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

export interface StdlibTypeInfo {
    size: number;
    alignment: number;
    ptrdata: number;
}

export class StructAnalyzer {
    private readonly typeSizes: Map<string, { size: number; alignment: number }>;
    private readonly stdlibTypes: Map<string, StdlibTypeInfo>;
    private architecture: string;
    private structRegistry = new Map<string, GoStruct>();

    constructor() {
        this.architecture = this.getArchitecture();
        this.typeSizes = this.initializeTypeSizes();
        this.stdlibTypes = this.initializeStdlibTypes();
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

    private initializeStdlibTypes(): Map<string, StdlibTypeInfo> {
        const ptrSize = this.getPtrSize();
        const types = new Map<string, StdlibTypeInfo>();

        // token.Position: {Filename string(16) + Offset int(8) + Line int(8) + Column int(8)}
        types.set('token.Position', { size: 40, alignment: 8, ptrdata: ptrSize });
        // time.Time: {wall uint64(8) + ext int64(8) + loc *Location(8)}
        types.set('time.Time', { size: 24, alignment: 8, ptrdata: ptrSize });
        // reflect.Value: {typ *rtype(8) + ptr unsafe.Pointer(8) + flag uintptr(8)}
        types.set('reflect.Value', { size: 24, alignment: 8, ptrdata: ptrSize });
        // reflect.Type: interface (2 pointer words)
        types.set('reflect.Type', { size: 16, alignment: 8, ptrdata: 2 * ptrSize });

        return types;
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

        // Seeded stdlib types
        const stdlibType = this.stdlibTypes.get(cleanType);
        if (stdlibType) {
            return { size: stdlibType.size, alignment: stdlibType.alignment };
        }
        if (baseName !== cleanType) {
            const stdlibBase = this.stdlibTypes.get(baseName);
            if (stdlibBase) {
                return { size: stdlibBase.size, alignment: stdlibBase.alignment };
            }
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

    // Returns the number of bytes the GC must scan within a type (ptrdata),
    // matching the semantics of fieldalignment's gcSizes.ptrdata().
    // This is the range from offset 0 to the last pointer word in the type.
    private getPtrData(type: string, visited: Set<string>): number {
        const ptrSize = this.getPtrSize();

        // Single pointer word types
        if (type.startsWith('*')) return ptrSize;
        const clean = type.trim();
        if (clean.startsWith('map[') || clean.startsWith('chan ') || clean === 'chan') return ptrSize;
        if (clean.startsWith('func(')) return ptrSize;

        // Interface: both words are pointers (type descriptor + data pointer)
        if (clean === 'interface{}' || clean === 'any' || clean.startsWith('interface{')) return ptrSize * 2;

        // String: first word is data pointer, second is length
        if (clean === 'string') return ptrSize;

        // Slice: first word is data pointer, rest are len + cap
        if (clean.startsWith('[]')) return ptrSize;

        // Array [N]T
        const arrayMatch = clean.match(/^\[(\d+)\](.+)/);
        if (arrayMatch) {
            const length = parseInt(arrayMatch[1]);
            const elemType = arrayMatch[2];
            const elemInfo = this.getTypeInfo(elemType, visited);
            const elemPtrData = this.getPtrData(elemType, visited);
            if (elemPtrData === 0) return 0;
            return (length - 1) * elemInfo.size + elemPtrData;
        }

        // Basic types (numeric, bool) — no pointers
        if (this.typeSizes.has(clean)) return 0;

        // Seeded stdlib types
        const stdlib = this.stdlibTypes.get(clean);
        if (stdlib) return stdlib.ptrdata;

        // Registered struct — recursively compute ptrdata through its fields
        const baseName = clean.includes('.') ? clean.split('.').pop()! : clean;
        if (baseName !== clean) {
            const stdlibBase = this.stdlibTypes.get(baseName);
            if (stdlibBase) return stdlibBase.ptrdata;
        }

        const struct = this.structRegistry.get(baseName);
        if (struct && !visited.has(baseName)) {
            const childVisited = new Set(visited);
            childVisited.add(baseName);
            let lastPtrEnd = 0;
            let currentOffset = 0;

            for (const field of struct.fields) {
                const ft = this.getTypeInfo(field.type, childVisited);
                const padding = this.calculatePadding(currentOffset, ft.alignment);
                currentOffset += padding;
                const fd = this.getPtrData(field.type, childVisited);
                if (fd > 0) {
                    lastPtrEnd = Math.max(lastPtrEnd, currentOffset + fd);
                }
                currentOffset += ft.size;
            }
            return lastPtrEnd;
        }

        // Unknown type — conservative: assume one pointer word
        return ptrSize;
    }

    // Number of bytes the GC must scan in the current field order.
    // Equals the end offset of the last pointer word.
    calculatePointerBytes(goStruct: GoStruct): number {
        const analysis = this.analyzeStruct(goStruct);
        let lastPtrEnd = 0;

        for (const field of analysis.fields) {
            const ptrData = this.getPtrData(field.type, new Set<string>());
            if (ptrData > 0) {
                lastPtrEnd = Math.max(lastPtrEnd, field.offset + ptrData);
            }
        }

        return lastPtrEnd;
    }

    // Reorder fields matching fieldalignment's optimalOrder() logic:
    //   1. zero-sized fields first   (avoids Go 1-byte tail padding)
    //   2. alignment DESC
    //   3. pointer-bearing before pointer-free  (ptrdata > 0 first)
    //   4. within pointer-bearing: trailing non-pointer bytes ASC  (size - ptrdata)
    //   5. size DESC
    //   6. name ASC
    getOptimalPointerOrder(fields: GoField[]): GoField[] {
        return [...fields].sort((a, b) => {
            const aInfo = this.getTypeInfo(a.type, new Set<string>());
            const bInfo = this.getTypeInfo(b.type, new Set<string>());
            const aPtr = this.getPtrData(a.type, new Set<string>());
            const bPtr = this.getPtrData(b.type, new Set<string>());

            // 1. zero-sized fields first
            const aZero = aInfo.size === 0 ? 0 : 1;
            const bZero = bInfo.size === 0 ? 0 : 1;
            if (aZero !== bZero) return aZero - bZero;

            // 2. alignment DESC
            if (aInfo.alignment !== bInfo.alignment) {
                return bInfo.alignment - aInfo.alignment;
            }

            // 3. pointer-bearing before pointer-free
            const aPtrFlag = aPtr > 0 ? 0 : 1;
            const bPtrFlag = bPtr > 0 ? 0 : 1;
            if (aPtrFlag !== bPtrFlag) return aPtrFlag - bPtrFlag;

            // 4. within pointer-bearing: fewer trailing non-pointer bytes first
            if (aPtr > 0 && bPtr > 0) {
                const aTrailing = aInfo.size - aPtr;
                const bTrailing = bInfo.size - bPtr;
                if (aTrailing !== bTrailing) return aTrailing - bTrailing;
            }

            // 5. size DESC
            if (aInfo.size !== bInfo.size) {
                return bInfo.size - aInfo.size;
            }

            // 6. name ASC
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