import fs from 'node:fs/promises';
import path from 'node:path';

export interface VSCodeExtensionConfig {
  name?: string;
  publisher?: string;
  version?: string;
  serverPort?: number;
  sentinelPath?: string;
}

export async function generateVSCodeExtension(
  outputDir: string,
  config?: VSCodeExtensionConfig,
): Promise<void> {
  const cfg: Required<VSCodeExtensionConfig> = {
    name: config?.name ?? 'sentinel-vscode',
    publisher: config?.publisher ?? 'sentinel',
    version: config?.version ?? '0.1.0',
    serverPort: config?.serverPort ?? 4096,
    sentinelPath: config?.sentinelPath ?? 'sentinel',
  };

  const srcDir = path.join(outputDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  await Promise.all([
    writeJson(path.join(outputDir, 'package.json'), {
      name: cfg.name,
      displayName: 'Sentinel',
      description: 'AI coding agent integration for VS Code',
      version: cfg.version,
      publisher: cfg.publisher,
      engines: { vscode: '^1.85.0' },
      categories: ['Programming Languages', 'Other'],
      activationEvents: ['onCommand:sentinel.run', 'onCommand:sentinel.toggleChat', 'onCommand:sentinel.diffView', 'onView:sentinel.chat'],
      contributes: {
        commands: [
          { command: 'sentinel.run', title: 'Sentinel: Run' },
          { command: 'sentinel.toggleChat', title: 'Sentinel: Toggle Chat' },
          { command: 'sentinel.diffView', title: 'Sentinel: Show Diff' },
        ],
        viewsContainers: { activitybar: [{ id: 'sentinel', title: 'Sentinel', icon: '$(rocket)' }] },
        views: { 'sentinel.chat': [{ type: 'webview', id: 'sentinel.chat', name: 'Sentinel Chat' }] },
        keybindings: [
          { command: 'sentinel.run', key: 'ctrl+shift+s', mac: 'cmd+shift+s', when: 'editorTextFocus' },
          { command: 'sentinel.toggleChat', key: 'ctrl+shift+x', mac: 'cmd+shift+x', when: 'editorTextFocus' },
        ],
      },
      main: './out/extension.js',
      scripts: { vscode: 'prepublish', compile: 'tsc -p ./' },
      devDependencies: {
        '@types/vscode': '^1.85.0',
        'typescript': '^5.7.0',
      },
    }),
    writeFile(path.join(srcDir, 'extension.ts'), generateExtensionSource(cfg)),
    writeFile(path.join(outputDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2021',
        outDir: 'out',
        rootDir: 'src',
        sourceMap: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['src'],
    }, null, 2)),
  ]);
}

function generateExtensionSource(cfg: Required<VSCodeExtensionConfig>): string {
  return `
import * as vscode from 'vscode';

const SERVER_URL = 'http://localhost:${cfg.serverPort}';
let protocol: IDEProtocol | null = null;
let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(rocket) Sentinel';
  statusBar.command = 'sentinel.toggleChat';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const disposable = vscode.commands.registerCommand('sentinel.run', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showWarningMessage('No active editor');
    const selection = editor.selection;
    const text = editor.document.getText(selection);
    const prompt = await vscode.window.showInputBox({ prompt: 'What do you want Sentinel to do?' });
    if (!prompt) return;
    await connect();
    if (protocol) {
      const result = await protocol.request('editor/getState', {
        file: editor.document.fileName,
        selection: text,
        language: editor.document.languageId,
      });
      if (result && typeof result === 'object' && 'diagnostics' in result) {
        const diagnostics = (result as Record<string, unknown>).diagnostics;
        if (Array.isArray(diagnostics) && diagnostics.length > 0) {
          vscode.window.showWarningMessage('Diagnostics found: ' + diagnostics.length);
        }
      }
      vscode.window.showInformationMessage('Sentinel: ' + prompt);
    }
  });
  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand('sentinel.toggleChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.sentinel');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sentinel.diffView', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const uri = editor.document.uri;
      const original = editor.document.getText();
      vscode.commands.executeCommand('vscode.diff', uri, uri, 'Sentinel Diff');
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sentinel.chat', {
      resolveWebviewView(webviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getChatHtml();
        webviewView.webview.onDidReceiveMessage(async (msg) => {
          if (msg.type === 'send' && msg.text) {
            if (protocol) {
              await protocol.notify('editor/getState', { prompt: msg.text });
            }
            webviewView.webview.postMessage({ type: 'response', text: 'Sentinel is processing...' });
          }
        });
      },
    })
  );

  connect();
}

export function deactivate() {
  if (protocol) protocol.dispose();
}

async function connect() {
  if (protocol) return;
  try {
    const socket = new WebSocket(SERVER_URL + '/ws');
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('WebSocket connection failed'));
      socket.onclose = () => { protocol = null; };
    });
    protocol = new IDEProtocol((msg) => socket.send(JSON.stringify(msg)));
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      protocol?.handleResponse(msg);
    };
    statusBar.text = '$(rocket) Sentinel (connected)';
  } catch {
    statusBar.text = '$(rocket) Sentinel (offline)';
  }
}

function getChatHtml(): string {
  return \`<!DOCTYPE html>
<html>
<head><style>
body { font-family: var(--vscode-font-family); padding: 10px; }
input { width: 100%; padding: 8px; box-sizing: border-box; }
#messages { margin-bottom: 10px; }
.msg { padding: 4px 0; }
</style></head>
<body>
  <div id="messages"></div>
  <input id="input" type="text" placeholder="Ask Sentinel..." />
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = e.target.value;
        vscode.postMessage({ type: 'send', text });
        const msgs = document.getElementById('messages');
        const div = document.createElement('div');
        div.className = 'msg';
        const b = document.createElement('b');
        b.textContent = 'You: ';
        div.append(b, text);
        msgs.appendChild(div);
        e.target.value = '';
      }
    });
    window.addEventListener('message', (e) => {
      const msg = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg';
      const b = document.createElement('b');
      b.textContent = 'Sentinel: ';
      div.append(b, e.data.text);
      msg.appendChild(div);
    });
  </script>
</body></html>\`;
}

interface IDEMessage {
  type: 'request' | 'response' | 'notification';
  id?: string;
  method: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

class IDEProtocol {
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private msgId = 0;
  constructor(private send: (msg: IDEMessage) => void) {}
  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(++this.msgId);
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'request', id, method, params });
    });
  }
  notify(method: string, params?: Record<string, unknown>): void {
    this.send({ type: 'notification', method, params });
  }
  handleResponse(msg: IDEMessage): void {
    if (!msg.id) return;
    const handler = this.pending.get(msg.id);
    if (!handler) return;
    this.pending.delete(msg.id);
    if (msg.error) handler.reject(new Error(msg.error.message));
    else handler.resolve(msg.result);
  }
  dispose(): void {
    for (const [, handler] of this.pending) handler.reject(new Error('Protocol disposed'));
    this.pending.clear();
  }
}
`.trim();
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
