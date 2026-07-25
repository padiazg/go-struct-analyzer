import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, State } from 'vscode-languageclient/node';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

declare const EXTENSION_VERSION: string;

let client: LanguageClient | undefined;
let statusItem: vscode.StatusBarItem;
let outputChannel: vscode.LogOutputChannel;

function parseSemver(v: string): [number, number, number] | null {
	const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
	if (!m) return null;
	return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

async function checkServerVersion(serverVer: string): Promise<boolean> {
	if (serverVer === 'dev' || serverVer === '0.0.0') return true;

	const extVer = parseSemver(EXTENSION_VERSION);
	const srvVer = parseSemver(serverVer);
	if (!extVer || !srvVer) return true;

	const [extMajor] = extVer;
	const [srvMajor] = srvVer;

	if (extMajor !== srvMajor) {
		const upgrade = 'curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh';
		outputChannel.error(`Major version mismatch: extension v${EXTENSION_VERSION} vs server v${serverVer}. Extension disabled.`);
		vscode.window.showErrorMessage(
			`Go Struct Analyzer: server version v${serverVer} is incompatible (extension is v${EXTENSION_VERSION})\n\nUpgrade:\n${upgrade}`,
			'Open Install Docs'
		).then(selection => {
			if (selection === 'Open Install Docs') {
				vscode.env.openExternal(vscode.Uri.parse('https://padiazg.github.io/go-struct-analyzer/getting-started/installation.html'));
			}
		});
		return false;
	}

	if (extVer[1] !== srvVer[1]) {
		outputChannel.warn(`Server v${serverVer} minor differs from extension v${EXTENSION_VERSION}. Consider updating.`);
	}

	return true;
}

export async function activate(context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('goStructAnalyzer');

	statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusItem.name = 'Go Struct Analyzer Status';
	statusItem.command = { title: 'Show Output', command: 'goStructAnalyzer.showOutput' };
	context.subscriptions.push(statusItem);

	outputChannel = vscode.window.createOutputChannel('Go Struct Analyzer', { log: true });
	context.subscriptions.push(outputChannel);

	context.subscriptions.push(
		vscode.commands.registerCommand('goStructAnalyzer.showOutput', () => outputChannel.show()),
	);

	const binaryPath = findBinary();
	if (!binaryPath) {
		setStatus('notfound');
		outputChannel.error('gsa-lsp binary not found');
		outputChannel.info('Install: curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh');
		outputChannel.show();
		return;
	}

	outputChannel.info(`Binary: ${binaryPath}`);
	setStatus('starting', binaryPath);

	const serverOptions: ServerOptions = {
		run: { command: binaryPath, args: ['lsp'] },
		debug: { command: binaryPath, args: ['lsp'] },
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'go', scheme: 'file' }],
		synchronize: { configurationSection: 'goStructAnalyzer' },
		initializationOptions: buildServerSettings(config),
		outputChannel,
		traceOutputChannel: outputChannel,
	};

	client = new LanguageClient(
		'goStructAnalyzer',
		'Go Struct Analyzer',
		serverOptions,
		clientOptions,
	);

	client.onDidChangeState(e => {
		if (e.newState === State.Running) {
			fetchVersion();
		}
	});

	try {
		await client.start();
	} catch (err) {
		setStatus('error', `${err}`);
		outputChannel.error(`LSP start failed: ${err}`);
		outputChannel.show();
		return;
	}

	outputChannel.info('LSP server started');

	setupInlineAnnotations(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('goStructAnalyzer.analyzeStruct', () => handleAnalyzeCommand()),
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('goStructAnalyzer')) {
				if (client) {
					const current = vscode.workspace.getConfiguration('goStructAnalyzer');
					client.sendNotification('workspace/didChangeConfiguration', {
						settings: { goStructAnalyzer: buildServerSettings(current) },
					});
				}
			}
		}),
	);
}

// buildServerSettings maps the goStructAnalyzer.* VS Code settings that
// gsa-lsp actually understands into the flat shape it expects, both at
// startup (initializationOptions) and on live changes
// (workspace/didChangeConfiguration).
function buildServerSettings(config: vscode.WorkspaceConfiguration) {
	return {
		architecture: config.get('architecture', 'amd64'),
		gcPressureSeverityWarning: config.get('gcPressureSeverityWarning', false),
		enableStructOptimizationWarnings: config.get('enableStructOptimizationWarnings', true),
		enableReorderCodeAction: config.get('enableReorderCodeAction', true),
		enableGCPressureWarnings: config.get('enableGCPressureWarnings', true),
	};
}

function setStatus(state: 'starting' | 'running' | 'error' | 'notfound', detail?: string) {
	switch (state) {
		case 'starting':
			statusItem.text = '$(sync~spin) GSA-LSP...';
			statusItem.tooltip = detail || 'Starting LSP server...';
			break;
		case 'running':
			statusItem.text = `$(check) GSA-LSP ${detail || ''}`;
			statusItem.tooltip = detail || 'LSP server running';
			break;
		case 'error':
			statusItem.text = '$(error) GSA-LSP';
			statusItem.tooltip = detail || 'LSP server error';
			break;
		case 'notfound':
			statusItem.text = '$(circle-slash) GSA-LSP';
			statusItem.tooltip = 'Binary not found. Install: curl -fsSL https://padiazg.github.io/go-struct-analyzer/install.sh | sh';
			break;
	}
	statusItem.show();
}

async function fetchVersion() {
	try {
		const info: any = await client!.sendRequest('$/version');
		const ver = info?.version || '?';
		const commit = info?.commit || '';
		const detail = commit ? `${ver} (${commit.slice(0, 7)})` : ver;
		setStatus('running', `v${ver}`);
		statusItem.tooltip = `Go Struct Analyzer v${detail}`;
		outputChannel.info(`Version: v${detail}`);

		const compat = await checkServerVersion(ver);
		if (!compat) {
			await client!.stop(3000);
			setStatus('error', 'Incompatible server version');
			return;
		}
	} catch {
		setStatus('running');
		outputChannel.warn('Version fetch failed (server may not support $/version)');
	}
}

function findBinary(): string | undefined {
	const binaryName = process.platform === 'win32' ? 'gsa-lsp.exe' : 'gsa-lsp';

	try {
		const gopath = cp.execSync('go env GOPATH', { encoding: 'utf8' }).trim();
		if (gopath) {
			const p = path.join(gopath, 'bin', binaryName);
			if (fs.existsSync(p)) return p;
		}
	} catch { }

	try {
		const which = cp.execSync(`which ${binaryName}`, { encoding: 'utf8' }).trim();
		if (which) return which;
	} catch { }

	try {
		const gobin = cp.execSync('go env GOBIN', { encoding: 'utf8' }).trim();
		if (gobin) {
			const p = path.join(gobin, binaryName);
			if (fs.existsSync(p)) return p;
		}
	} catch { }

	return undefined;
}

function setupInlineAnnotations(context: vscode.ExtensionContext) {
	const sizeDecoration = vscode.window.createTextEditorDecorationType({});

	const paddingDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255, 80, 80, 0.12)',
		isWholeLine: true,
	});

	context.subscriptions.push(sizeDecoration, paddingDecoration);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const update = async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'go' || !client || !client.isRunning()) {
			return;
		}

		if (!vscode.workspace.getConfiguration('goStructAnalyzer').get('showInlineAnnotations', false)) {
			editor.setDecorations(sizeDecoration, []);
			editor.setDecorations(paddingDecoration, []);
			return;
		}

		try {
			const data: any = await client.sendRequest('$/structData', {
				textDocument: { uri: editor.document.uri.toString() },
			});

			if (!data || !data.structs) {
				editor.setDecorations(sizeDecoration, []);
				editor.setDecorations(paddingDecoration, []);
				return;
			}

			const sizeOpts: vscode.DecorationOptions[] = [];
			const paddingOpts: vscode.DecorationOptions[] = [];

			for (const st of data.structs) {
				for (const field of st.fields) {
					if (!field.line) continue;
					const lineIdx = field.line - 1;
					const lineText = editor.document.lineAt(lineIdx);

					sizeOpts.push({
						range: new vscode.Range(lineIdx, lineText.text.length, lineIdx, lineText.text.length),
						renderOptions: {
							after: {
								contentText: `// ${field.size}B (off:${field.offset})`,
								color: '#888888',
							},
						},
					});

					if (field.padding > 0 && vscode.workspace.getConfiguration('goStructAnalyzer').get('showPadding', true)) {
						paddingOpts.push({
							range: new vscode.Range(lineIdx - 1, 0, lineIdx, 0),
							hoverMessage: `+${field.padding}B padding before ${field.name}`,
						});
					}
				}

				const lastField = st.fields[st.fields.length - 1];
				if (lastField && lastField.line) {
					const endOff = lastField.offset + lastField.size;
					if (endOff < st.totalSize) {
						const finalPad = st.totalSize - endOff;
						const lastLineIdx = lastField.line - 1;
						const line = editor.document.lineAt(lastLineIdx);
						sizeOpts.push({
							range: new vscode.Range(lastLineIdx, line.text.length, lastLineIdx, line.text.length),
							renderOptions: {
								after: {
									contentText: ` // +${finalPad}B padding`,
									color: '#e06c75',
								},
							},
						});
					}
				}
			}

			editor.setDecorations(sizeDecoration, sizeOpts);
			editor.setDecorations(paddingDecoration, paddingOpts);
		} catch { }
	};

	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(update, 300);
	};

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(schedule),
		vscode.workspace.onDidChangeTextDocument(e => { if (e.document.languageId === 'go') schedule(); }),
		vscode.workspace.onDidSaveTextDocument(e => { if (e.languageId === 'go') schedule(); }),
		vscode.window.onDidChangeVisibleTextEditors(schedule),
	);

	setTimeout(update, 500);
}

async function handleAnalyzeCommand() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'go') {
		vscode.window.showErrorMessage('Open a Go file first');
		return;
	}

	if (!client || !client.isRunning()) {
		vscode.window.showErrorMessage('Go Struct Analyzer LSP not running');
		return;
	}

	try {
		const data: any = await client.sendRequest('$/structData', {
			textDocument: { uri: editor.document.uri.toString() },
		});

		if (!data || !data.structs || data.structs.length === 0) {
			vscode.window.showInformationMessage('No structs found in file');
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'goStructAnalyzer',
			'Struct Analysis',
			vscode.ViewColumn.Beside,
			{ enableScripts: false },
		);

		panel.webview.html = renderAnalysisWebview(data);
	} catch (err) {
		vscode.window.showErrorMessage(`Analysis failed: ${err}`);
	}
}

function renderAnalysisWebview(data: any): string {
	const renderFields = (fields: any[]) =>
		fields.map((f: any) =>
			`<tr><td>${f.name}</td><td>${f.type}</td><td>${f.size}</td><td>${f.offset}</td><td>${f.padding > 0 ? `<span class="pad">${f.padding}</span>` : '0'}</td></tr>`
		).join('');

	const renderStruct = (st: any) => {
		const canReduce = st.optimalSize < st.totalSize;
		const canReduceGC = st.optimalPointerBytes < st.pointerBytes;
		return `
		<div class="struct">
			<h2>struct ${st.name}</h2>
			<table>
				<thead><tr><th>Field</th><th>Type</th><th>Size</th><th>Offset</th><th>Padding</th></tr></thead>
				<tbody>${renderFields(st.fields)}</tbody>
				<tfoot>
					<tr><td colspan="5" class="total">Total: ${st.totalSize}B (align: ${st.alignment})</td></tr>
					${st.pointerBytes > 0 ? `<tr><td colspan="5" class="gc">GC scan: ${st.pointerBytes}B</td></tr>` : ''}
				</tfoot>
			</table>
			${canReduce ? `<div class="warn">⚠ ${st.totalSize}B → ${st.optimalSize}B (save ${st.totalSize - st.optimalSize}B)</div>` : ''}
			${canReduceGC ? `<div class="hint">💡 GC: ${st.pointerBytes}B → ${st.optimalPointerBytes}B</div>` : ''}
			${canReduce ? `<details><summary>Optimal Layout (${st.optimalSize}B)</summary><table><thead><tr><th>Field</th><th>Type</th><th>Size</th><th>Offset</th></tr></thead><tbody>${renderFields(st.optimalFields)}</tbody></table></details>` : ''}
		</div>`;
	};

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
	body { font-family: monospace; padding: 20px; }
	.struct { margin-bottom: 24px; }
	h2 { margin: 0 0 8px; }
	table { border-collapse: collapse; width: 100%; }
	th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-editor-lineHighlightBackground); }
	.total { font-weight: bold; padding-top: 8px; }
	.gc { color: #5599ff; font-size: 0.9em; }
	.pad { color: #e06c75; }
	.warn { margin: 8px 0; padding: 8px; background: rgba(255,165,0,0.15); border: 1px solid orange; border-radius: 4px; }
	.hint { margin: 8px 0; padding: 8px; background: rgba(85,153,255,0.15); border: 1px solid #5599ff; border-radius: 4px; }
	details { margin-top: 8px; }
	summary { cursor: pointer; font-weight: bold; }
</style></head><body>
<h1>Go Struct Analysis</h1>
${data.structs.map(renderStruct).join('\n')}
</body></html>`;
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) return undefined;
	return client.stop();
}
