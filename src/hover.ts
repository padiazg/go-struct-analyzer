import * as vscode from 'vscode';
import { GoStructParser, GoStruct, GoField } from './parser';
import { StructAnalyzer } from './analyzer';

export class HoverProvider implements vscode.HoverProvider {
    constructor(
        private parser: GoStructParser,
        private analyzer: StructAnalyzer
    ) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const structs = await this.parser.parseDocument(document);
        
        // Find struct and field at position
        for (const struct of structs) {
            if (struct.range.contains(position)) {
                const field = struct.fields.find((f: any) => f.range.contains(position));
                if (field) {
                    return this.createFieldHover(struct, field);
                }
                
                // If hovering over struct name
                const structNameLine = document.lineAt(struct.line).text;
                const structNameMatch = structNameLine.match(/type\s+(\w+)\s+struct/);
                if (structNameMatch) {
                    const structNameStart = structNameLine.indexOf(structNameMatch[1]);
                    const structNameEnd = structNameStart + structNameMatch[1].length;
                    const structNameRange = new vscode.Range(
                        new vscode.Position(struct.line, structNameStart),
                        new vscode.Position(struct.line, structNameEnd)
                    );
                    
                    if (structNameRange.contains(position)) {
                        return this.createStructHover(struct);
                    }
                }
            }
        }
        
        return undefined;
    }

    private createFieldHover(struct: GoStruct, field: GoField): vscode.Hover {
        const analysis = this.analyzer.analyzeStruct(struct);
        const fieldAnalysis = analysis.fields.find((f: any) => f.name === field.name);
        
        if (!fieldAnalysis) {
            return new vscode.Hover(new vscode.MarkdownString(`**${field.name}** \`${field.type}\``));
        }

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        
        markdown.appendMarkdown(`**${field.name}** \`${field.type}\`\n\n`);
        markdown.appendMarkdown(`• **Size:** ${fieldAnalysis.size} bytes\n`);
        markdown.appendMarkdown(`• **Alignment:** ${fieldAnalysis.alignment} bytes\n`);
        markdown.appendMarkdown(`• **Offset:** ${fieldAnalysis.offset} bytes\n`);
        
        if (fieldAnalysis.padding > 0) {
            markdown.appendMarkdown(`• **Padding before:** ${fieldAnalysis.padding} bytes\n`);
        }
        
        markdown.appendMarkdown(`\n---\n`);
        markdown.appendMarkdown(`*Struct ${struct.name} total size: ${analysis.totalSize} bytes*`);

        return new vscode.Hover(markdown, field.range);
    }

    private createStructHover(struct: GoStruct): vscode.Hover {
        const analysis = this.analyzer.analyzeStruct(struct);
        
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        
        markdown.appendMarkdown(`**struct ${struct.name}**\n\n`);
        markdown.appendMarkdown(`• **Total size:** ${analysis.totalSize} bytes\n`);
        markdown.appendMarkdown(`• **Alignment:** ${analysis.alignment} bytes\n`);
        markdown.appendMarkdown(`• **Fields:** ${analysis.fields.length}\n\n`);
        
        markdown.appendMarkdown(`**Memory Layout:**\n`);
        markdown.appendCodeblock(this.generateMemoryLayoutText(analysis), 'text');

        return new vscode.Hover(markdown);
    }

    private generateMemoryLayoutText(analysis: any): string {
        let layout = '';
        let currentOffset = 0;
        
        for (const field of analysis.fields) {
            // Add padding if needed
            if (field.padding > 0) {
                layout += `[${currentOffset.toString().padStart(2, '0')}] padding (${field.padding} bytes)\n`;
                currentOffset += field.padding;
            }
            
            // Add field
            const offsetEnd = currentOffset + field.size - 1;
            layout += `[${currentOffset.toString().padStart(2, '0')}-${offsetEnd.toString().padStart(2, '0')}] ${field.name} (${field.size} bytes)\n`;
            currentOffset += field.size;
        }
        
        // Final padding
        if (currentOffset < analysis.totalSize) {
            const finalPadding = analysis.totalSize - currentOffset;
            layout += `[${currentOffset.toString().padStart(2, '0')}] final padding (${finalPadding} bytes)\n`;
        }
        
        return layout;
    }
}