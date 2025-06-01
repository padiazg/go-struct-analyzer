import * as vscode from 'vscode';
import { GoStructParser } from './parser';
import { StructAnalyzer } from './analyzer';
import { HoverProvider } from './hover';
import { CodeLensProvider } from './codelens';
import { StructDiagnosticsProvider } from './diagnostics';

let globalAnalyzer: StructAnalyzer;

export function activate(context: vscode.ExtensionContext) {
    console.log('Go Struct Analyzer is now active!');

    const parser = new GoStructParser();
    const analyzer = new StructAnalyzer();
    globalAnalyzer = analyzer;
    
    // Register hover provider
    const hoverProvider = new HoverProvider(parser, analyzer);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('go', hoverProvider)
    );

    // Register code lens provider
    const codeLensProvider = new CodeLensProvider(parser, analyzer);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('go', codeLensProvider)
    );

    // Register diagnostics provider
    const diagnosticsProvider = new StructDiagnosticsProvider(parser, analyzer);
    context.subscriptions.push(diagnosticsProvider);
    
    // Provide diagnostics on file open and save
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
    
    // Provide diagnostics for already open documents
    vscode.workspace.textDocuments.forEach(provideDiagnostics);

    // Register command
    const analyzeCommand = vscode.commands.registerCommand(
        'goStructAnalyzer.analyzeStruct',
        async (struct?: any, analysis?: any) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'go') {
                vscode.window.showErrorMessage('Please open a Go file');
                return;
            }

            // If called from code lens, use provided struct and analysis
            if (struct && analysis) {
                showStructAnalysis(analysis, struct);
                return;
            }

            // If called from command palette, find struct at cursor
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
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: monospace; padding: 20px; }
                .struct-info { margin-bottom: 20px; }
                .field { display: flex; justify-content: space-between; padding: 4px 0; }
                .padding { color: #888; font-style: italic; }
                .total { font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px; }
            </style>
        </head>
        <body>
            <div class="struct-info">
                <h2>${analysis.name}</h2>
                <div>Total Size: ${analysis.totalSize} bytes</div>
                <div>Alignment: ${analysis.alignment} bytes</div>
                ${struct ? generateOptimizationInfo(struct) : ''}
            </div>
            <div class="fields">
                ${analysis.fields.map((field: any) => `
                    <div class="field">
                        <span>${field.name} ${field.type}</span>
                        <span>${field.size} bytes (offset: ${field.offset})</span>
                    </div>
                    ${field.padding > 0 ? `
                        <div class="field padding">
                            <span>// padding</span>
                            <span>${field.padding} bytes</span>
                        </div>
                    ` : ''}
                `).join('')}
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
        <div style="margin-top: 10px; padding: 10px; background-color: #1a1a1a; border: 1px solid #ffa500; border-radius: 4px; color: #ffffff;">
            <strong style="color: #ffa500;">⚠️ Optimization Opportunity</strong><br>
            <span style="color: #ffffff;">This struct can be optimized from ${currentSize} bytes to ${optimalSize} bytes (saves ${savings} bytes)</span><br>
            <em style="color: #cccccc;">Reorder fields by alignment: largest alignment first, then by size</em>
        </div>
    `;
}

export function deactivate() {}