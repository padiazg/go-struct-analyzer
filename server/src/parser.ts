/** A zero-based line/character position. */
export interface Position {
    line: number;
    character: number;
}

/** A range between two positions. */
export interface Range {
    start: Position;
    end: Position;
}

export interface GoField {
    name: string;
    type: string;
    line: number;
    range: Range;
    lineRange: Range;
    tag?: string;
    inlineComment?: string;
    leadingComments: string[];
    originalText: string;
    isEmbedded: boolean;
}

export interface GoStruct {
    name: string;
    fields: GoField[];
    range: Range;
    line: number;
    hasMultiNameFields: boolean;
}

function pos(line: number, character: number): Position {
    return { line, character };
}

function range(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return { start: pos(startLine, startChar), end: pos(endLine, endChar) };
}

export class GoStructParser {
    parseText(text: string): GoStruct[] {
        const structs: GoStruct[] = [];
        const lines = text.split('\n');

        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

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
                    let netBraces = 0;
                    for (const ch of lines[i]) {
                        if (ch === '{') netBraces++;
                        if (ch === '}') netBraces--;
                    }

                    if (netBraces <= 0) {
                        structs.push({
                            name: structName,
                            fields: [],
                            range: range(
                                structStartLine, 0,
                                structStartLine, lines[structStartLine]?.length || 0,
                            ),
                            line: structStartLine,
                            hasMultiNameFields: false,
                        });
                    } else {
                        const { fields, hasMultiNameFields } = this.parseStructFields(lines, i + 1);
                        const structEndLine = this.findStructEnd(lines, i + 1);

                        structs.push({
                            name: structName,
                            fields,
                            range: range(
                                structStartLine, 0,
                                structEndLine, lines[structEndLine]?.length || 0,
                            ),
                            line: structStartLine,
                            hasMultiNameFields,
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

            if (!trimmed) {
                leadingComments = [];
                i++;
                continue;
            }

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
                    range: range(i, fieldStart, i, fieldEnd),
                    lineRange: range(i, 0, i, rawLine.length),
                    tag: fieldMatch.tag,
                    inlineComment: fieldMatch.inlineComment,
                    leadingComments: [...leadingComments],
                    originalText: rawLine,
                    isEmbedded: fieldMatch.isEmbedded,
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
                    comment: line.substring(i).trim(),
                };
            }
        }
        return { text: line.trim() };
    }

    private parseFieldLine(line: string): { name: string; type: string; tag?: string; inlineComment?: string; isEmbedded: boolean; isMultiName: boolean } | null {
        const { text: withoutComment, comment: inlineComment } = this.extractInlineComment(line);

        let tag: string | undefined;
        let workLine = withoutComment;
        const tagMatch = workLine.match(/`([^`]+)`\s*$/);
        if (tagMatch) {
            tag = tagMatch[1];
            workLine = workLine.replace(/\s*`[^`]+`\s*$/, '').trim();
        }

        if (!workLine) return null;

        if (!/\s/.test(workLine)) {
            const typeName = workLine.replace(/^\*/, '');
            return {
                name: typeName.split('.').pop() || typeName,
                type: workLine,
                tag,
                inlineComment,
                isEmbedded: true,
                isMultiName: false,
            };
        }

        const multiMatch = workLine.match(/^(\w+(?:\s*,\s*\w+)+)\s+(.+)$/);
        if (multiMatch) {
            const names = multiMatch[1].split(',').map((n: string) => n.trim());
            return {
                name: names[0],
                type: multiMatch[2].trim(),
                tag,
                inlineComment,
                isEmbedded: false,
                isMultiName: true,
            };
        }

        const simpleMatch = workLine.match(/^(\w+)\s+(.+)$/);
        if (simpleMatch) {
            return {
                name: simpleMatch[1],
                type: simpleMatch[2].trim(),
                tag,
                inlineComment,
                isEmbedded: false,
                isMultiName: false,
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
