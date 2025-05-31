import * as vscode from 'vscode';
import { GoStructParser, GoStruct } from './parser';
import { StructAnalyzer } from './analyzer';

export class CodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        private parser: GoStructParser,
        private analyzer: StructAnalyzer
    ) {}

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const config = vscode.workspace.getConfiguration('goStructAnalyzer');
        const showInlineAnnotations = config.get<boolean>('showInlineAnnotations', true);
        
        if (!showInlineAnnotations) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const structs = await this.parser.parseDocument(document);

        for (const struct of structs) {
            const analysis = this.analyzer.analyzeStruct(struct);
            
            // Add code lens for struct total size
            const structLine = document.lineAt(struct.line);
            const structMatch = structLine.text.match(/type\s+(\w+)\s+struct/);
            if (structMatch) {
                const structNameEnd = structLine.text.indexOf(structMatch[1]) + structMatch[1].length;
                const range = new vscode.Range(
                    new vscode.Position(struct.line, structNameEnd),
                    new vscode.Position(struct.line, structNameEnd)
                );
                
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `${analysis.totalSize} bytes total`,
                    command: 'goStructAnalyzer.analyzeStruct',
                    tooltip: `Click to view detailed memory layout for ${struct.name}`
                }));
            }

            // Add code lens for each field
            for (let i = 0; i < struct.fields.length; i++) {
                const field = struct.fields[i];
                const fieldAnalysis = analysis.fields.find((f: any) => f.name === field.name);
                
                if (fieldAnalysis) {
                    const line = document.lineAt(field.line);
                    const lineText = line.text;
                    const fieldEndIndex = lineText.indexOf(field.name) + field.name.length;
                    
                    const range = new vscode.Range(
                        new vscode.Position(field.line, fieldEndIndex),
                        new vscode.Position(field.line, fieldEndIndex)
                    );
                    
                    let title = `${fieldAnalysis.size}B`;
                    if (fieldAnalysis.padding > 0) {
                        title += ` (+${fieldAnalysis.padding}B padding)`;
                    }
                    
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: title,
                        command: '',
                        tooltip: this.generateFieldTooltip(fieldAnalysis)
                    }));
                }
            }
        }

        return codeLenses;
    }

    private generateFieldTooltip(fieldAnalysis: any): string {
        let tooltip = `Size: ${fieldAnalysis.size} bytes\n`;
        tooltip += `Alignment: ${fieldAnalysis.alignment} bytes\n`;
        tooltip += `Offset: ${fieldAnalysis.offset} bytes`;
        
        if (fieldAnalysis.padding > 0) {
            tooltip += `\nPadding before: ${fieldAnalysis.padding} bytes`;
        }
        
        return tooltip;
    }
}