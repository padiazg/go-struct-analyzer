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

    constructor(architecture: string = 'amd64') {
        this.architecture = architecture;
        this.typeSizes = this.initializeTypeSizes();
    }

    setArchitecture(arch: string): void {
        this.architecture = arch;
        this.typeSizes.clear();
        for (const [k, v] of this.initializeTypeSizes()) {
            this.typeSizes.set(k, v);
        }
    }

    setStructRegistry(structs: GoStruct[]): void {
        this.structRegistry.clear();
        for (const s of structs) {
            this.structRegistry.set(s.name, s);
        }
    }

    private getPtrSize(): number {
        return this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
    }

    private initializeTypeSizes(): Map<string, { size: number; alignment: number }> {
        const sizes = new Map<string, { size: number; alignment: number }>();
        const is64Bit = this.architecture === 'amd64' || this.architecture === 'arm64';
        const ptrSize = is64Bit ? 8 : 4;

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

        sizes.set('int', { size: ptrSize, alignment: ptrSize });
        sizes.set('uint', { size: ptrSize, alignment: ptrSize });
        sizes.set('uintptr', { size: ptrSize, alignment: ptrSize });

        sizes.set('string', { size: ptrSize * 2, alignment: ptrSize });

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
                padding,
            });

            currentOffset += typeInfo.size;
        }

        const finalPadding = this.calculatePadding(currentOffset, maxAlignment);
        const totalSize = currentOffset + finalPadding;

        return {
            name: goStruct.name,
            fields,
            totalSize,
            alignment: maxAlignment,
        };
    }

    private getTypeInfo(type: string, visited?: Set<string>): { size: number; alignment: number } {
        const cleanType = type.replace(/^\*+/, '');
        const ptrSize = this.getPtrSize();

        if (type.startsWith('*')) {
            return { size: ptrSize, alignment: ptrSize };
        }

        if (cleanType.startsWith('[]')) {
            return { size: ptrSize * 3, alignment: ptrSize };
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
            return { size: ptrSize * 2, alignment: ptrSize };
        }

        if (cleanType.startsWith('func(')) {
            return { size: ptrSize, alignment: ptrSize };
        }

        const basicType = this.typeSizes.get(cleanType);
        if (basicType) {
            return basicType;
        }

        const baseName = cleanType.includes('.') ? cleanType.split('.').pop()! : cleanType;
        const registered = this.structRegistry.get(baseName);
        if (registered && !visited?.has(baseName)) {
            const childVisited = new Set(visited);
            childVisited.add(baseName);
            const analysis = this.analyzeStructInternal(registered, childVisited);
            return { size: analysis.totalSize, alignment: analysis.alignment };
        }

        return { size: ptrSize, alignment: ptrSize };
    }

    private calculatePadding(currentOffset: number, alignment: number): number {
        const remainder = currentOffset % alignment;
        return remainder === 0 ? 0 : alignment - remainder;
    }

    getTotalStructSize(goStruct: GoStruct): number {
        return this.analyzeStruct(goStruct).totalSize;
    }

    getOptimalStructSize(goStruct: GoStruct): number {
        const optimizedFields = this.getOptimalFieldOrder(goStruct.fields);
        return this.analyzeStruct({ ...goStruct, fields: optimizedFields }).totalSize;
    }

    getOptimalFieldOrder(fields: GoField[]): GoField[] {
        const fieldsWithInfo = fields.map(field => ({
            field,
            typeInfo: this.getTypeInfo(field.type, new Set<string>()),
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

    canOptimizeStruct(goStruct: GoStruct): boolean {
        const currentSize = this.getTotalStructSize(goStruct);
        const optimalSize = this.getOptimalStructSize(goStruct);
        return optimalSize < currentSize;
    }

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

        const baseName = clean.includes('.') ? clean.split('.').pop()! : clean;
        return this.getPointerClassOfStruct(baseName, visited);
    }

    private getPointerClassOfStruct(name: string, visited: Set<string>): 'pure' | 'mixed' | 'none' {
        if (visited.has(name)) return 'none';
        const struct = this.structRegistry.get(name);
        if (!struct) return 'mixed';

        const childVisited = new Set(visited);
        childVisited.add(name);

        for (const field of struct.fields) {
            if (this.getPointerClass(field.type, childVisited) !== 'none') {
                return 'mixed';
            }
        }
        return 'none';
    }

    calculatePointerBytes(goStruct: GoStruct): number {
        const analysis = this.analyzeStruct(goStruct);
        let lastPtrEnd = 0;

        for (const field of analysis.fields) {
            const cls = this.getPointerClass(field.type);
            if (cls === 'none') continue;

            if (cls === 'pure') {
                lastPtrEnd = Math.max(lastPtrEnd, field.offset + field.size);
            } else {
                lastPtrEnd = Math.max(lastPtrEnd, field.offset + 8);
            }
        }

        return lastPtrEnd;
    }

    getOptimalPointerOrder(fields: GoField[]): GoField[] {
        const clsRank: Record<string, number> = { pure: 0, mixed: 1, none: 2 };

        return [...fields].sort((a, b) => {
            const aInfo = this.getTypeInfo(a.type, new Set<string>());
            const bInfo = this.getTypeInfo(b.type, new Set<string>());
            const aCls = this.getPointerClass(a.type);
            const bCls = this.getPointerClass(b.type);

            if (aInfo.alignment !== bInfo.alignment) {
                return bInfo.alignment - aInfo.alignment;
            }

            if (clsRank[aCls] !== clsRank[bCls]) {
                return clsRank[aCls] - clsRank[bCls];
            }

            if (aCls === 'mixed' && aInfo.size !== bInfo.size) {
                return aInfo.size - bInfo.size;
            }

            if (aInfo.size !== bInfo.size) {
                return bInfo.size - aInfo.size;
            }

            return a.name.localeCompare(b.name);
        });
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
