import * as vscode from 'vscode';
import { GoStruct, GoField } from './go_parser';

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

    constructor() {
        this.architecture = this.getArchitecture();
        this.typeSizes = this.initializeTypeSizes();
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
        const fields: FieldAnalysis[] = [];
        let currentOffset = 0;
        let maxAlignment = 1;

        for (const field of goStruct.fields) {
            const typeInfo = this.getTypeInfo(field.type);
            maxAlignment = Math.max(maxAlignment, typeInfo.alignment);

            // Calculate padding needed for alignment
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

        // Final padding to align struct size to its alignment requirement
        const finalPadding = this.calculatePadding(currentOffset, maxAlignment);
        const totalSize = currentOffset + finalPadding;

        return {
            name: goStruct.name,
            fields: fields,
            totalSize: totalSize,
            alignment: maxAlignment
        };
    }

    private getTypeInfo(type: string): { size: number; alignment: number } {
        // Remove pointer markers and get base type
        const cleanType = type.replace(/^\*+/, '');
        
        // Handle pointers
        if (type.startsWith('*')) {
            const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
            return { size: ptrSize, alignment: ptrSize };
        }

        // Handle slices
        if (cleanType.startsWith('[]')) {
            const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
            return { size: ptrSize * 3, alignment: ptrSize }; // ptr + len + cap
        }

        // Handle arrays
        const arrayMatch = cleanType.match(/^\[(\d+)\](.+)/);
        if (arrayMatch) {
            const length = parseInt(arrayMatch[1]);
            const elementType = arrayMatch[2];
            const elementInfo = this.getTypeInfo(elementType);
            return {
                size: length * elementInfo.size,
                alignment: elementInfo.alignment
            };
        }

        // Handle maps, channels
        if (cleanType.startsWith('map[') || cleanType.startsWith('chan ')) {
            const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
            return { size: ptrSize, alignment: ptrSize };
        }

        // Handle interfaces
        if (cleanType === 'interface{}' || cleanType.startsWith('interface{')) {
            const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
            return { size: ptrSize * 2, alignment: ptrSize }; // type + data
        }

        // Handle functions
        if (cleanType.startsWith('func(')) {
            const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
            return { size: ptrSize, alignment: ptrSize };
        }

        // Look up basic types
        const basicType = this.typeSizes.get(cleanType);
        if (basicType) {
            return basicType;
        }

        // Default for unknown types (custom structs, etc.)
        // This is a simplification - in reality we'd need to recursively analyze
        const ptrSize = this.architecture === 'amd64' || this.architecture === 'arm64' ? 8 : 4;
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
        
        const typeInfo = this.getTypeInfo(field.type);
        return `${typeInfo.size}B`;
    }

    getTotalStructSize(goStruct: GoStruct): number {
        const analysis = this.analyzeStruct(goStruct);
        return analysis.totalSize;
    }
}