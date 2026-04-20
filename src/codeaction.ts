import * as vscode from 'vscode';
import { GoStructParser, GoStruct, GoField } from './parser';
import { StructAnalyzer } from './analyzer';
import { DIAGNOSTIC_CODE_OPTIMIZABLE } from './diagnostics';

export class StructReorderCodeActionProvider implements vscode.CodeActionProvider {
    constructor(
        private parser: GoStructParser,
        private analyzer: StructAnalyzer
    ) {}

    async provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext
    ): Promise<vscode.CodeAction[]> {
        const config = vscode.workspace.getConfiguration('goStructAnalyzer');
        if (!config.get<boolean>('enableReorderCodeAction', true)) {
            return [];
        }

        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code !== DIAGNOSTIC_CODE_OPTIMIZABLE) continue;

            const structRange = diagnostic.relatedInformation?.[0]?.location?.range;
            if (!structRange) continue;

            const structs = await this.parser.parseDocument(document);
            const struct = structs.find(s =>
                s.range.start.line === structRange.start.line &&
                s.range.end.line === structRange.end.line
            );
            if (!struct) continue;

            // Skip if multi-name fields present (e.g. `a, b int`)
            if (struct.hasMultiNameFields) continue;

            // Skip if any embedded fields — complex reordering semantics
            if (struct.fields.some(f => f.isEmbedded)) continue;

            // Skip single-field structs
            if (struct.fields.length <= 1) continue;

            const optimalOrder = this.analyzer.getOptimalFieldOrder(struct.fields);

            const orderChanged = struct.fields.some((f, idx) => f.name !== optimalOrder[idx].name);
            if (!orderChanged) continue;

            const newText = this.buildReorderedStructText(document, struct, optimalOrder);
            if (!newText) continue;

            const action = new vscode.CodeAction(
                'Reorder struct fields to optimize memory layout',
                vscode.CodeActionKind.QuickFix
            );
            action.diagnostics = [diagnostic];
            action.isPreferred = config.get<boolean>('reorderCodeActionPreferred', false);

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, struct.range, newText);
            action.edit = edit;

            actions.push(action);
        }

        return actions;
    }

    private buildReorderedStructText(
        document: vscode.TextDocument,
        struct: GoStruct,
        optimalOrder: GoField[]
    ): string | null {
        const lines = document.getText().split('\n');
        const openLine = lines[struct.range.start.line];
        const closeLine = lines[struct.range.end.line];
        const indent = this.detectIndent(struct.fields[0]?.originalText ?? '\t');

        const fieldLines: string[] = [];
        for (const field of optimalOrder) {
            for (const comment of field.leadingComments) {
                fieldLines.push(comment);
            }
            fieldLines.push(this.reconstructFieldLine(field, indent));
        }

        return [openLine, ...fieldLines, closeLine].join('\n');
    }

    private reconstructFieldLine(field: GoField, fallbackIndent: string): string {
        const indent = this.detectIndent(field.originalText) || fallbackIndent;
        let line = indent;

        line += field.isEmbedded ? field.type : `${field.name} ${field.type}`;

        if (field.tag) {
            line += ` \`${field.tag}\``;
        }
        if (field.inlineComment) {
            line += ` ${field.inlineComment}`;
        }

        return line;
    }

    private detectIndent(text: string): string {
        const match = text.match(/^(\s+)/);
        return match ? match[1] : '\t';
    }
}
