import * as vscode from 'vscode';
import { GoStructParser } from './parser';
import { StructAnalyzer } from './analyzer';
import { HoverProvider } from './hover';
import { CodeLensProvider } from './codelens';

export function activate(context: vscode.ExtensionContext) {
    console.log('Go Struct Analyzer is now active!');

    const parser = new GoStructParser();
    const analyzer = new StructAnalyzer();
    
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

    // Register command
    const analyzeCommand = vscode.commands.registerCommand(
        'goStructAnalyzer.analyzeStruct',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'go') {
                vscode.window.showErrorMessage('Please open a Go file');
                return;
            }

            const position = editor.selection.active;
            const structs = await parser.parseDocument(editor.document);
            const structAtPosition = structs.find((s: any) => 
                s.range.contains(position)
            );

            if (structAtPosition) {
                const analysis = analyzer.analyzeStruct(structAtPosition);
                showStructAnalysis(analysis);
            } else {
                vscode.window.showInformationMessage('No struct found at cursor position');
            }
        }
    );
    
    context.subscriptions.push(analyzeCommand);
}

function showStructAnalysis(analysis: any) {
    const panel = vscode.window.createWebviewPanel(
        'structAnalysis',
        'Struct Memory Layout',
        vscode.ViewColumn.Beside,
        {}
    );

    panel.webview.html = generateAnalysisHTML(analysis);
}

function generateAnalysisHTML(analysis: any): string {
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

export function deactivate() {}