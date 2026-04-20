#!/usr/bin/env node

import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    Diagnostic,
    DiagnosticSeverity,
    Hover,
    MarkupKind,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    TextEdit,
    HoverParams,
    DidChangeConfigurationNotification,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { GoStructParser, GoStruct, GoField, Range } from './parser';
import { StructAnalyzer, StructAnalysis, FieldAnalysis } from './analyzer';

const DIAGNOSTIC_CODE_OPTIMIZABLE = 'struct-layout-optimization';
const DIAGNOSTIC_CODE_POINTER_BYTES = 'struct-gc-pointer-bytes';

interface Settings {
    architecture: string;
    enableStructOptimizationWarnings: boolean;
    enableReorderCodeAction: boolean;
    enableGCPressureWarnings: boolean;
    gcPressureSeverityWarning: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    architecture: 'amd64',
    enableStructOptimizationWarnings: true,
    enableReorderCodeAction: true,
    enableGCPressureWarnings: true,
    gcPressureSeverityWarning: false,
};

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const parser = new GoStructParser();
let analyzer = new StructAnalyzer(DEFAULT_SETTINGS.architecture);
let settings: Settings = { ...DEFAULT_SETTINGS };
let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
    hasConfigurationCapability = !!(
        params.capabilities.workspace && params.capabilities.workspace.configuration
    );

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            hoverProvider: true,
            codeActionProvider: {
                codeActionKinds: [CodeActionKind.QuickFix],
            },
        },
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});

connection.onDidChangeConfiguration(async (_change) => {
    if (hasConfigurationCapability) {
        const config = await connection.workspace.getConfiguration('goStructAnalyzer');
        if (config) {
            settings = {
                architecture: config.architecture ?? DEFAULT_SETTINGS.architecture,
                enableStructOptimizationWarnings: config.enableStructOptimizationWarnings ?? DEFAULT_SETTINGS.enableStructOptimizationWarnings,
                enableReorderCodeAction: config.enableReorderCodeAction ?? DEFAULT_SETTINGS.enableReorderCodeAction,
                enableGCPressureWarnings: config.enableGCPressureWarnings ?? DEFAULT_SETTINGS.enableGCPressureWarnings,
                gcPressureSeverityWarning: config.gcPressureSeverityWarning ?? DEFAULT_SETTINGS.gcPressureSeverityWarning,
            };
            analyzer = new StructAnalyzer(settings.architecture);
        }
    }

    documents.all().forEach(validateDocument);
});

// --- Diagnostics ---

documents.onDidChangeContent((change) => {
    validateDocument(change.document);
});

function validateDocument(document: TextDocument): void {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const structs = parser.parseText(text);
    analyzer.setStructRegistry(structs);

    if (settings.enableStructOptimizationWarnings) {
        for (const struct of structs) {
            if (analyzer.canOptimizeStruct(struct)) {
                const currentSize = analyzer.getTotalStructSize(struct);
                const optimalSize = analyzer.getOptimalStructSize(struct);
                const wastedBytes = currentSize - optimalSize;
                diagnostics.push(createOptimizationDiagnostic(text, struct, currentSize, optimalSize, wastedBytes));
            }
        }
    }

    if (settings.enableGCPressureWarnings) {
        for (const struct of structs) {
            if (analyzer.canReducePointerBytes(struct)) {
                const currentPB = analyzer.calculatePointerBytes(struct);
                const optimalPB = analyzer.getOptimalPointerBytes(struct);
                diagnostics.push(createPointerBytesDiagnostic(text, struct, currentPB, optimalPB));
            }
        }
    }

    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function structNameRange(text: string, struct: GoStruct): Range {
    const lines = text.split('\n');
    const line = lines[struct.line] ?? '';
    const match = line.match(/type\s+(\w+)\s+struct/);
    if (match) {
        const start = line.indexOf(match[1]);
        return {
            start: { line: struct.line, character: start },
            end: { line: struct.line, character: start + match[1].length },
        };
    }
    return struct.range;
}

function createOptimizationDiagnostic(
    text: string,
    struct: GoStruct,
    currentSize: number,
    optimalSize: number,
    wastedBytes: number,
): Diagnostic {
    return {
        range: structNameRange(text, struct),
        severity: DiagnosticSeverity.Warning,
        source: 'Go Struct Analyzer',
        code: DIAGNOSTIC_CODE_OPTIMIZABLE,
        message: `Struct layout can be optimized: ${currentSize} bytes → ${optimalSize} bytes (saves ${wastedBytes} bytes)`,
        data: { structRange: struct.range },
    };
}

function createPointerBytesDiagnostic(
    text: string,
    struct: GoStruct,
    currentPB: number,
    optimalPB: number,
): Diagnostic {
    return {
        range: structNameRange(text, struct),
        severity: settings.gcPressureSeverityWarning
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Hint,
        source: 'Go Struct Analyzer',
        code: DIAGNOSTIC_CODE_POINTER_BYTES,
        message: `Struct GC scan range can be reduced: ${currentPB} bytes → ${optimalPB} bytes (reduces GC pressure)`,
        data: { structRange: struct.range },
    };
}

// --- Hover ---

connection.onHover((params: HoverParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const structs = parser.parseText(text);
    analyzer.setStructRegistry(structs);
    const position = params.position;

    for (const struct of structs) {
        if (!contains(struct.range, position)) continue;

        const field = struct.fields.find(f => contains(f.range, position));
        if (field) {
            return createFieldHover(struct, field);
        }

        const nameRange = structNameRange(text, struct);
        if (contains(nameRange, position)) {
            return createStructHover(struct);
        }
    }

    return null;
});

function contains(range: Range, pos: { line: number; character: number }): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) return false;
    if (pos.line === range.start.line && pos.character < range.start.character) return false;
    if (pos.line === range.end.line && pos.character > range.end.character) return false;
    return true;
}

function createFieldHover(struct: GoStruct, field: GoField): Hover {
    const analysis = analyzer.analyzeStruct(struct);
    const fieldAnalysis = analysis.fields.find(f => f.name === field.name);

    if (!fieldAnalysis) {
        return {
            contents: { kind: MarkupKind.Markdown, value: `**${field.name}** \`${field.type}\`` },
            range: field.range,
        };
    }

    let md = `**${field.name}** \`${field.type}\`\n\n`;
    md += `• **Size:** ${fieldAnalysis.size} bytes\n`;
    md += `• **Alignment:** ${fieldAnalysis.alignment} bytes\n`;
    md += `• **Offset:** ${fieldAnalysis.offset} bytes\n`;
    if (fieldAnalysis.padding > 0) {
        md += `• **Padding before:** ${fieldAnalysis.padding} bytes\n`;
    }
    md += `\n---\n`;
    md += `*Struct ${struct.name} total size: ${analysis.totalSize} bytes*`;

    return {
        contents: { kind: MarkupKind.Markdown, value: md },
        range: field.range,
    };
}

function createStructHover(struct: GoStruct): Hover {
    const analysis = analyzer.analyzeStruct(struct);

    let md = `**struct ${struct.name}**\n\n`;
    md += `• **Total size:** ${analysis.totalSize} bytes\n`;
    md += `• **Alignment:** ${analysis.alignment} bytes\n`;
    md += `• **Fields:** ${analysis.fields.length}\n\n`;
    md += `**Memory Layout:**\n`;
    md += '```text\n' + generateMemoryLayoutText(analysis) + '```';

    return {
        contents: { kind: MarkupKind.Markdown, value: md },
    };
}

function generateMemoryLayoutText(analysis: StructAnalysis): string {
    let layout = '';
    let currentOffset = 0;

    for (const field of analysis.fields) {
        if (field.padding > 0) {
            layout += `[${currentOffset.toString().padStart(2, '0')}] padding (${field.padding} bytes)\n`;
            currentOffset += field.padding;
        }

        const offsetEnd = currentOffset + field.size - 1;
        layout += `[${currentOffset.toString().padStart(2, '0')}-${offsetEnd.toString().padStart(2, '0')}] ${field.name} (${field.size} bytes)\n`;
        currentOffset += field.size;
    }

    if (currentOffset < analysis.totalSize) {
        const finalPadding = analysis.totalSize - currentOffset;
        layout += `[${currentOffset.toString().padStart(2, '0')}] final padding (${finalPadding} bytes)\n`;
    }

    return layout;
}

// --- Code Actions ---

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    if (!settings.enableReorderCodeAction) return [];

    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const structs = parser.parseText(text);
    analyzer.setStructRegistry(structs);
    const actions: CodeAction[] = [];

    for (const diagnostic of params.context.diagnostics) {
        const isSize = diagnostic.code === DIAGNOSTIC_CODE_OPTIMIZABLE;
        const isPtrBytes = diagnostic.code === DIAGNOSTIC_CODE_POINTER_BYTES;
        if (!isSize && !isPtrBytes) continue;

        const structRange: Range | undefined = (diagnostic.data as any)?.structRange;
        if (!structRange) continue;

        const struct = structs.find(
            s =>
                s.range.start.line === structRange.start.line &&
                s.range.end.line === structRange.end.line,
        );
        if (!struct) continue;

        if (struct.hasMultiNameFields) continue;
        if (struct.fields.every(f => f.isEmbedded)) continue;
        if (struct.fields.length <= 1) continue;

        const optimalOrder = isPtrBytes
            ? analyzer.getOptimalPointerOrder(struct.fields)
            : analyzer.getOptimalFieldOrder(struct.fields);

        const orderChanged = struct.fields.some((f, idx) => f.name !== optimalOrder[idx].name);
        if (!orderChanged) continue;

        const newText = buildReorderedStructText(text, struct, optimalOrder);
        if (!newText) continue;

        const title = isPtrBytes
            ? 'Reorder struct fields to reduce GC scan range'
            : 'Reorder struct fields to optimize memory layout';

        actions.push({
            title,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: isSize,
            edit: {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.replace(struct.range, newText),
                    ],
                },
            },
        });
    }

    return actions;
});

function buildReorderedStructText(text: string, struct: GoStruct, optimalOrder: GoField[]): string | null {
    const lines = text.split('\n');
    const openLine = lines[struct.range.start.line];
    const closeLine = lines[struct.range.end.line];
    const indent = detectIndent(struct.fields[0]?.originalText ?? '\t');

    const fieldLines: string[] = [];
    for (const field of optimalOrder) {
        for (const comment of field.leadingComments) {
            fieldLines.push(comment);
        }
        fieldLines.push(reconstructFieldLine(field, indent));
    }

    return [openLine, ...fieldLines, closeLine].join('\n');
}

function reconstructFieldLine(field: GoField, fallbackIndent: string): string {
    const indent = detectIndent(field.originalText) || fallbackIndent;
    let line = indent;

    line += field.isEmbedded ? field.type : `${field.name} ${field.type}`;

    if (field.tag) {
        line += ` \`${field.tag}\``;
    }
    if (field.inlineComment) {
        line += ` ${field.inlineComment}`;
    }

    return line;
}

function detectIndent(text: string): string {
    const match = text.match(/^(\s+)/);
    return match ? match[1] : '\t';
}

// --- Start ---

documents.listen(connection);
connection.listen();
