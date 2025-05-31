import * as vscode from 'vscode';

export interface GoField {
    name: string;
    type: string;
    line: number;
    range: vscode.Range;
}

export interface GoStruct {
    name: string;
    fields: GoField[];
    range: vscode.Range;
    line: number;
}

export class GoStructParser {
    async parseDocument(document: vscode.TextDocument): Promise<GoStruct[]> {
        const structs: GoStruct[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // Look for struct definitions
            const structMatch = line.match(/type\s+(\w+)\s+struct\s*\{?/);
            if (structMatch) {
                const structName = structMatch[1];
                const structStartLine = i;
                
                // Find opening brace if not on same line
                let braceFound = line.includes('{');
                if (!braceFound) {
                    i++;
                    while (i < lines.length && !lines[i].includes('{')) {
                        i++;
                    }
                    braceFound = i < lines.length;
                }
                
                if (braceFound) {
                    const fields = await this.parseStructFields(lines, i + 1, document);
                    const structEndLine = this.findStructEnd(lines, i + 1);
                    
                    structs.push({
                        name: structName,
                        fields: fields,
                        range: new vscode.Range(
                            new vscode.Position(structStartLine, 0),
                            new vscode.Position(structEndLine, lines[structEndLine]?.length || 0)
                        ),
                        line: structStartLine
                    });
                    
                    i = structEndLine;
                }
            }
            i++;
        }
        
        return structs;
    }
    
    private async parseStructFields(lines: string[], startLine: number, document: vscode.TextDocument): Promise<GoField[]> {
        const fields: GoField[] = [];
        let i = startLine;
        
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // End of struct
            if (line.startsWith('}')) {
                break;
            }
            
            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('/*')) {
                i++;
                continue;
            }
            
            // Parse field line
            const fieldMatch = this.parseFieldLine(line);
            if (fieldMatch) {
                const fieldStart = lines[i].indexOf(fieldMatch.name);
                const fieldEnd = fieldStart + fieldMatch.name.length;
                
                fields.push({
                    name: fieldMatch.name,
                    type: fieldMatch.type,
                    line: i,
                    range: new vscode.Range(
                        new vscode.Position(i, fieldStart),
                        new vscode.Position(i, fieldEnd)
                    )
                });
            }
            
            i++;
        }
        
        return fields;
    }
    
    private parseFieldLine(line: string): { name: string; type: string } | null {
        // Remove comments
        const cleanLine = line.split('//')[0].trim();
        
        // Handle various field formats:
        // fieldName fieldType
        // fieldName, fieldName2 fieldType
        // *fieldType (anonymous)
        // fieldType (embedded)
        
        // Simple case: name type
        const simpleMatch = cleanLine.match(/^(\w+)\s+(.+?)(?:\s+`[^`]*`)?$/);
        if (simpleMatch) {
            return {
                name: simpleMatch[1],
                type: simpleMatch[2].trim()
            };
        }
        
        // Multiple fields: name1, name2 type
        const multiMatch = cleanLine.match(/^(\w+(?:\s*,\s*\w+)*)\s+(.+?)(?:\s+`[^`]*`)?$/);
        if (multiMatch) {
            const names = multiMatch[1].split(',').map(n => n.trim());
            const type = multiMatch[2].trim();
            // For simplicity, just return the first name
            return {
                name: names[0],
                type: type
            };
        }
        
        // Embedded field (just type)
        const embeddedMatch = cleanLine.match(/^(\*?\w+(?:\.\w+)?)(?:\s+`[^`]*`)?$/);
        if (embeddedMatch) {
            const type = embeddedMatch[1];
            return {
                name: type.replace('*', '').split('.').pop() || type,
                type: type
            };
        }
        
        return null;
    }
    
    private findStructEnd(lines: string[], startLine: number): number {
        let braceCount = 1;
        let i = startLine;
        
        while (i < lines.length && braceCount > 0) {
            const line = lines[i];
            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }
            if (braceCount === 0) break;
            i++;
        }
        
        return Math.min(i, lines.length - 1);
    }
}