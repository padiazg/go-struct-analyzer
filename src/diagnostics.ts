import * as vscode from 'vscode';
import { GoStructParser, GoStruct } from './parser';
import { StructAnalyzer } from './analyzer';

export const DIAGNOSTIC_CODE_OPTIMIZABLE   = 'struct-layout-optimization';
export const DIAGNOSTIC_CODE_POINTER_BYTES = 'struct-gc-pointer-bytes';

export class StructDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    
    constructor(
        private parser: GoStructParser,
        private analyzer: StructAnalyzer
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('goStructAnalyzer');
    }

    async provideDiagnostics(document: vscode.TextDocument): Promise<void> {
        const config = vscode.workspace.getConfiguration('goStructAnalyzer');
        const enableDiagnostics = config.get<boolean>('enableStructOptimizationWarnings', true);
        
        if (!enableDiagnostics) {
            this.diagnosticCollection.clear();
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const structs = await this.parser.parseDocument(document);
        this.analyzer.setStructRegistry(structs);

        for (const struct of structs) {
            if (this.analyzer.canOptimizeStruct(struct)) {
                const currentSize = this.analyzer.getTotalStructSize(struct);
                const optimalSize = this.analyzer.getOptimalStructSize(struct);
                const wastedBytes = currentSize - optimalSize;
                diagnostics.push(this.createOptimizationDiagnostic(
                    struct, currentSize, optimalSize, wastedBytes, document
                ));
            }

            const enableGC = config.get<boolean>('enableGCPressureWarnings', true);
            if (enableGC && this.analyzer.canReducePointerBytes(struct)) {
                const currentPB = this.analyzer.calculatePointerBytes(struct);
                const optimalPB = this.analyzer.getOptimalPointerBytes(struct);
                diagnostics.push(this.createPointerBytesDiagnostic(
                    struct, currentPB, optimalPB, document
                ));
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private createOptimizationDiagnostic(
        struct: GoStruct,
        currentSize: number,
        optimalSize: number,
        wastedBytes: number,
        document: vscode.TextDocument
    ): vscode.Diagnostic {
        const line = document.lineAt(struct.line);
        const structMatch = line.text.match(/type\s+(\w+)\s+struct/);
        
        let range = struct.range;
        if (structMatch) {
            const structNameStart = line.text.indexOf(structMatch[1]);
            const structNameEnd = structNameStart + structMatch[1].length;
            range = new vscode.Range(
                new vscode.Position(struct.line, structNameStart),
                new vscode.Position(struct.line, structNameEnd)
            );
        }

        const message = `Struct layout can be optimized: ${currentSize} bytes → ${optimalSize} bytes (saves ${wastedBytes} bytes)`;
        
        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Warning
        );
        
        diagnostic.source = 'Go Struct Analyzer';
        diagnostic.code = DIAGNOSTIC_CODE_OPTIMIZABLE;
        diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, struct.range),
                'struct body range'
            )
        ];

        return diagnostic;
    }

    private createPointerBytesDiagnostic(
        struct: GoStruct,
        currentPB: number,
        optimalPB: number,
        document: vscode.TextDocument
    ): vscode.Diagnostic {
        const line = document.lineAt(struct.line);
        const structMatch = line.text.match(/type\s+(\w+)\s+struct/);

        let range = struct.range;
        if (structMatch) {
            const start = line.text.indexOf(structMatch[1]);
            range = new vscode.Range(
                new vscode.Position(struct.line, start),
                new vscode.Position(struct.line, start + structMatch[1].length)
            );
        }

        const gcAsWarning = vscode.workspace.getConfiguration('goStructAnalyzer').get<boolean>('gcPressureSeverityWarning', false);
        const diagnostic = new vscode.Diagnostic(
            range,
            `Struct GC scan range can be reduced: ${currentPB} bytes → ${optimalPB} bytes (reduces GC pressure)`,
            gcAsWarning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Hint
        );
        diagnostic.source = 'Go Struct Analyzer';
        diagnostic.code = DIAGNOSTIC_CODE_POINTER_BYTES;
        diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, struct.range),
                'struct body range'
            )
        ];
        return diagnostic;
    }

    clear(): void {
        this.diagnosticCollection.clear();
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}