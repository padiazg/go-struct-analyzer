import * as vscode from 'vscode';
import { GoStructParser, GoStruct } from './parser';
import { StructAnalyzer } from './analyzer';

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

        for (const struct of structs) {
            if (this.analyzer.canOptimizeStruct(struct)) {
                const currentSize = this.analyzer.getTotalStructSize(struct);
                const optimalSize = this.analyzer.getOptimalStructSize(struct);
                const wastedBytes = currentSize - optimalSize;
                
                const diagnostic = this.createOptimizationDiagnostic(
                    struct,
                    currentSize,
                    optimalSize,
                    wastedBytes,
                    document
                );
                
                diagnostics.push(diagnostic);
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
        diagnostic.code = 'struct-layout-optimization';
        
        return diagnostic;
    }

    clear(): void {
        this.diagnosticCollection.clear();
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}