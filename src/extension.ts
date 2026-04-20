import * as vscode from 'vscode';
import { GoStructParser } from './parser';
import { StructAnalyzer, StructAnalysis } from './analyzer';
import { HoverProvider } from './hover';
import { CodeLensProvider } from './codelens';
import { StructDiagnosticsProvider } from './diagnostics';
import { StructReorderCodeActionProvider } from './codeaction';

let globalAnalyzer: StructAnalyzer;

export function activate(context: vscode.ExtensionContext) {
    console.log('Go Struct Analyzer is now active!');

    const parser = new GoStructParser();
    const analyzer = new StructAnalyzer();
    globalAnalyzer = analyzer;

    const hoverProvider = new HoverProvider(parser, analyzer);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('go', hoverProvider)
    );

    const codeLensProvider = new CodeLensProvider(parser, analyzer);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('go', codeLensProvider)
    );

    const diagnosticsProvider = new StructDiagnosticsProvider(parser, analyzer);
    context.subscriptions.push(diagnosticsProvider);

    const provideDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId === 'go') {
            diagnosticsProvider.provideDiagnostics(document);
        }
    };

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(provideDiagnostics),
        vscode.workspace.onDidSaveTextDocument(provideDiagnostics),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.languageId === 'go') {
                diagnosticsProvider.provideDiagnostics(event.document);
            }
        })
    );

    vscode.workspace.textDocuments.forEach(provideDiagnostics);

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'go', scheme: 'file' },
            new StructReorderCodeActionProvider(parser, analyzer),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );

    const analyzeCommand = vscode.commands.registerCommand(
        'goStructAnalyzer.analyzeStruct',
        async (struct?: any, analysis?: any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'go') {
                vscode.window.showErrorMessage('Please open a Go file');
                return;
            }

            if (struct && analysis) {
                showStructAnalysis(analysis, struct);
                return;
            }

            const position = editor.selection.active;
            const structs = await parser.parseDocument(editor.document);
            const structAtPosition = structs.find((s: any) =>
                s.range.contains(position)
            );

            if (structAtPosition) {
                const structAnalysis = analyzer.analyzeStruct(structAtPosition);
                showStructAnalysis(structAnalysis, structAtPosition);
            } else {
                vscode.window.showInformationMessage('No struct found at cursor position');
            }
        }
    );

    context.subscriptions.push(analyzeCommand);
}

function showStructAnalysis(analysis: any, struct?: any) {
    const panel = vscode.window.createWebviewPanel(
        'structAnalysis',
        `Struct Memory Layout - ${analysis.name}`,
        vscode.ViewColumn.Beside,
        {}
    );

    panel.webview.html = generateAnalysisHTML(analysis, struct);
}

function generateAnalysisHTML(analysis: any, struct?: any): string {
    const canOptimize = struct && globalAnalyzer && globalAnalyzer.canOptimizeStruct(struct);
    const optimalAnalysis: StructAnalysis | null = canOptimize
        ? globalAnalyzer.computeOptimalLayout(struct)
        : null;

    const renderFieldRows = (fields: any[]) =>
        fields.map((field: any) => `
            <tr>
                <td>${field.name}</td>
                <td>${field.type}</td>
                <td>${field.size}</td>
                <td>${field.offset}</td>
                <td>${field.padding > 0 ? `<span class="padding">${field.padding}</span>` : '0'}</td>
            </tr>
        `).join('');

    const currentTable = `
        <table>
            <thead><tr><th>Field</th><th>Type</th><th>Size</th><th>Offset</th><th>Padding</th></tr></thead>
            <tbody>${renderFieldRows(analysis.fields)}</tbody>
            <tfoot><tr><td colspan="5" class="total">Total: ${analysis.totalSize} bytes (align: ${analysis.alignment})</td></tr></tfoot>
        </table>`;

    const optimalTable = optimalAnalysis ? `
        <table>
            <thead><tr><th>Field</th><th>Type</th><th>Size</th><th>Offset</th><th>Padding</th></tr></thead>
            <tbody>${renderFieldRows(optimalAnalysis.fields)}</tbody>
            <tfoot><tr><td colspan="5" class="total">Total: ${optimalAnalysis.totalSize} bytes (align: ${optimalAnalysis.alignment})</td></tr></tfoot>
        </table>` : '';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: monospace; padding: 20px; }
                h2 { margin-bottom: 4px; }
                .banner { margin: 12px 0; padding: 10px; background-color: #1a1a1a; border: 1px solid #ffa500; border-radius: 4px; color: #ffffff; }
                .banner strong { color: #ffa500; }
                .banner em { color: #cccccc; }
                .columns { display: flex; gap: 24px; flex-wrap: wrap; }
                .column { flex: 1; min-width: 280px; }
                .column h3 { margin-bottom: 6px; }
                table { border-collapse: collapse; width: 100%; }
                th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #333; }
                th { font-weight: bold; }
                .padding { color: #e06c75; }
                .total { font-weight: bold; padding-top: 8px; }
            </style>
        </head>
        <body>
            <h2>${analysis.name}</h2>
            ${struct ? generateOptimizationInfo(struct) : ''}
            <div class="columns">
                <div class="column">
                    <h3>Current Layout</h3>
                    ${currentTable}
                </div>
                ${optimalAnalysis ? `
                <div class="column">
                    <h3>Optimal Layout</h3>
                    ${optimalTable}
                </div>` : ''}
            </div>
        </body>
        </html>
    `;
}

function generateOptimizationInfo(struct: any): string {
    if (!globalAnalyzer || !globalAnalyzer.canOptimizeStruct(struct)) {
        return '';
    }

    const currentSize = globalAnalyzer.getTotalStructSize(struct);
    const optimalSize = globalAnalyzer.getOptimalStructSize(struct);
    const savings = currentSize - optimalSize;

    return `
        <div class="banner">
            <strong>⚠️ Optimization Opportunity</strong><br>
            <span>This struct can be optimized from ${currentSize} bytes to ${optimalSize} bytes (saves ${savings} bytes)</span><br>
            <em>Reorder fields by alignment: largest alignment first, then by size</em>
        </div>
    `;
}

export function deactivate() {}
