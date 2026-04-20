import * as vscode from 'vscode';

export interface GoField {
    name: string;
    type: string;
    line: number;
    range: vscode.Range;
    lineRange: vscode.Range;
    tag?: string;
    inlineComment?: string;
    leadingComments: string[];
    originalText: string;
    isEmbedded: boolean;
}

export interface GoStruct {
    name: string;
    fields: GoField[];
    range: vscode.Range;
    line: number;
    hasMultiNameFields: boolean;
}

export class GoStructParser {
    async parseDocument(document: vscode.TextDocument): Promise<GoStruct[]> {
        const structs: GoStruct[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

            // Supports generics: type Foo[T any] struct { ... }
            const structMatch = line.match(/type\s+(\w+)(?:\[[^\]]*\])?\s+struct\s*\{?/);
            if (structMatch) {
                const structName = structMatch[1];
                const structStartLine = i;

                let braceFound = line.includes('{');
                if (!braceFound) {
                    i++;
                    while (i < lines.length && !lines[i].includes('{')) {
                        i++;
                    }
                    braceFound = i < lines.length;
                }

                if (braceFound) {
                    // Count net braces on the opening line to detect inline structs like `type Empty struct{}`
                    let netBraces = 0;
                    for (const ch of lines[i]) {
                        if (ch === '{') netBraces++;
                        if (ch === '}') netBraces--;
                    }

                    if (netBraces <= 0) {
                        // Struct opens and closes on the same line — no fields
                        structs.push({
                            name: structName,
                            fields: [],
                            range: new vscode.Range(
                                new vscode.Position(structStartLine, 0),
                                new vscode.Position(structStartLine, lines[structStartLine]?.length || 0)
                            ),
                            line: structStartLine,
                            hasMultiNameFields: false
                        });
                    } else {
                        const { fields, hasMultiNameFields } = this.parseStructFields(lines, i + 1);
                        const structEndLine = this.findStructEnd(lines, i + 1);

                        structs.push({
                            name: structName,
                            fields,
                            range: new vscode.Range(
                                new vscode.Position(structStartLine, 0),
                                new vscode.Position(structEndLine, lines[structEndLine]?.length || 0)
                            ),
                            line: structStartLine,
                            hasMultiNameFields
                        });

                        i = structEndLine;
                    }
                }
            }
            i++;
        }

        return structs;
    }

    private parseStructFields(lines: string[], startLine: number): { fields: GoField[]; hasMultiNameFields: boolean } {
        const fields: GoField[] = [];
        let hasMultiNameFields = false;
        let i = startLine;
        let leadingComments: string[] = [];

        while (i < lines.length) {
            const trimmed = lines[i].trim();

            if (trimmed.startsWith('}')) {
                break;
            }

            // Blank line resets leading comment accumulation
            if (!trimmed) {
                leadingComments = [];
                i++;
                continue;
            }

            // Comment line — accumulate as potential leading comments for next field
            if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                leadingComments.push(lines[i]);
                i++;
                continue;
            }

            const fieldMatch = this.parseFieldLine(trimmed);
            if (fieldMatch) {
                if (fieldMatch.isMultiName) {
                    hasMultiNameFields = true;
                }

                const rawLine = lines[i];
                const nameIdx = rawLine.indexOf(fieldMatch.name);
                const fieldStart = nameIdx >= 0 ? nameIdx : 0;
                const fieldEnd = fieldStart + fieldMatch.name.length;

                fields.push({
                    name: fieldMatch.name,
                    type: fieldMatch.type,
                    line: i,
                    range: new vscode.Range(
                        new vscode.Position(i, fieldStart),
                        new vscode.Position(i, fieldEnd)
                    ),
                    lineRange: new vscode.Range(
                        new vscode.Position(i, 0),
                        new vscode.Position(i, rawLine.length)
                    ),
                    tag: fieldMatch.tag,
                    inlineComment: fieldMatch.inlineComment,
                    leadingComments: [...leadingComments],
                    originalText: rawLine,
                    isEmbedded: fieldMatch.isEmbedded
                });

                leadingComments = [];
            }

            i++;
        }

        return { fields, hasMultiNameFields };
    }

    private extractInlineComment(line: string): { text: string; comment?: string } {
        let inBacktick = false;
        for (let i = 0; i < line.length - 1; i++) {
            if (line[i] === '`') {
                inBacktick = !inBacktick;
            }
            if (!inBacktick && line[i] === '/' && line[i + 1] === '/') {
                return {
                    text: line.substring(0, i).trim(),
                    comment: line.substring(i).trim()
                };
            }
        }
        return { text: line.trim() };
    }

    private parseFieldLine(line: string): { name: string; type: string; tag?: string; inlineComment?: string; isEmbedded: boolean; isMultiName: boolean } | null {
        const { text: withoutComment, comment: inlineComment } = this.extractInlineComment(line);

        // Extract struct tag
        let tag: string | undefined;
        let workLine = withoutComment;
        const tagMatch = workLine.match(/`([^`]+)`\s*$/);
        if (tagMatch) {
            tag = tagMatch[1];
            workLine = workLine.replace(/\s*`[^`]+`\s*$/, '').trim();
        }

        if (!workLine) return null;

        // Embedded field: no whitespace (just a type reference like `T`, `*T`, `pkg.T`, `*pkg.T`)
        if (!/\s/.test(workLine)) {
            const typeName = workLine.replace(/^\*/, '');
            return {
                name: typeName.split('.').pop() || typeName,
                type: workLine,
                tag,
                inlineComment,
                isEmbedded: true,
                isMultiName: false
            };
        }

        // Multi-name field: name1, name2 type
        const multiMatch = workLine.match(/^(\w+(?:\s*,\s*\w+)+)\s+(.+)$/);
        if (multiMatch) {
            const names = multiMatch[1].split(',').map((n: string) => n.trim());
            return {
                name: names[0],
                type: multiMatch[2].trim(),
                tag,
                inlineComment,
                isEmbedded: false,
                isMultiName: true
            };
        }

        // Simple field: name type
        const simpleMatch = workLine.match(/^(\w+)\s+(.+)$/);
        if (simpleMatch) {
            return {
                name: simpleMatch[1],
                type: simpleMatch[2].trim(),
                tag,
                inlineComment,
                isEmbedded: false,
                isMultiName: false
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
