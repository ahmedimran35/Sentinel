import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

type ServerStatus = 'offline' | 'starting' | 'connected';

let serverProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;
let serverStatus: ServerStatus = 'offline';
let sseController: AbortController | null = null;
let webviewProvider: ChatWebviewProvider | null = null;
let activeSessionId: string | null = null;

function getConfig() {
  return vscode.workspace.getConfiguration('sentinel');
}

function serverUrl(): string {
  const c = getConfig();
  return `http://${c.get('serverHost', 'localhost')}:${c.get('serverPort', 4096)}`;
}

function authHeaders(): Record<string, string> {
  const pw = getConfig().get<string>('password', '');
  if (!pw) return {};
  return { Authorization: 'Basic ' + Buffer.from(':' + pw).toString('base64') };
}

function statusText(s: ServerStatus): string {
  switch (s) {
    case 'offline': return '$(rocket) Sentinel: Offline';
    case 'starting': return '$(sync~spin) Sentinel: Starting...';
    case 'connected': return '$(rocket) Sentinel: Running';
  }
}

function updateStatusBar(s: ServerStatus): void {
  serverStatus = s;
  statusBarItem.text = statusText(s);
  statusBarItem.command = s === 'offline' ? 'sentinel.start' : 'sentinel.stop';
  statusBarItem.tooltip = s === 'offline' ? 'Start Sentinel server' : 'Stop Sentinel server';
  webviewProvider?.postMessage({ type: 'status', status: s });
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar('offline');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('sentinel.start', startServerCmd),
    vscode.commands.registerCommand('sentinel.stop', stopServerCmd),
    vscode.commands.registerCommand('sentinel.toggleChat', toggleChat),
    vscode.commands.registerCommand('sentinel.sendSelection', sendSelectionCmd),
  );

  webviewProvider = new ChatWebviewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sentinel.chat', webviewProvider, { webviewOptions: { retainContextWhenHidden: true } })
  );

  if (getConfig().get<boolean>('autoStart', true)) {
    startServerCmd();
  }
}

export function deactivate() {
  killServer();
}

async function startServerCmd(): Promise<void> {
  if (serverProcess) {
    vscode.window.showInformationMessage('Sentinel is already running');
    return;
  }
  updateStatusBar('starting');

  const serverScript = findServerScript();
  if (serverScript) {
    serverProcess = spawn('node', [serverScript, '--port', String(getConfig().get('serverPort', 4096))], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  } else {
    serverProcess = spawn('npx', ['@sentinel/cli', 'serve', '--port', String(getConfig().get('serverPort', 4096))], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  }

  serverProcess.stdout?.on('data', (d: Buffer) => {
    console.warn('[sentinel]', d.toString().trim());
  });
  serverProcess.stderr?.on('data', (d: Buffer) => {
    console.error('[sentinel]', d.toString().trim());
  });
  serverProcess.on('exit', (code) => {
    console.warn('[sentinel] server exited', code);
    serverProcess = null;
    sseController?.abort();
    sseController = null;
    updateStatusBar('offline');
  });
  serverProcess.on('error', () => {
    serverProcess = null;
    updateStatusBar('offline');
  });

  await waitForServer();
  updateStatusBar('connected');
  connectSSE();
  webviewProvider?.postMessage({ type: 'connected' });
}

function stopServerCmd(): void {
  killServer();
  if (serverStatus === 'offline') {
    statusBarItem.text = '$(rocket) Sentinel: Start';
  }
}

function killServer(): void {
  sseController?.abort();
  sseController = null;
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    const pid = serverProcess;
    setTimeout(() => {
      if (pid) {
        pid.kill('SIGKILL');
        if (serverProcess === pid) serverProcess = null;
      }
    }, 3000);
  }
  updateStatusBar('offline');
}

function findServerScript(): string | null {
  const candidates = [
    resolve(__dirname, '..', '..', 'server', 'dist', 'index.js'),
    resolve(__dirname, '..', '..', 'node_modules', '@sentinel', 'server', 'dist', 'index.js'),
    resolve(__dirname, '..', 'node_modules', '@sentinel', 'server', 'dist', 'index.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function waitForServer(): Promise<void> {
  const url = serverUrl();
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${url}/health`, { headers: authHeaders() });
      if (res.ok) return;
    } catch { /* server not ready yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Server did not start within 60s');
}

async function fetchApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as { error?: { message: string }; data?: T };
  if (json.error) throw new Error(json.error.message);
  return json.data as T;
}

function sanitizeJson(raw: string): unknown {
  return JSON.parse(raw, (_key, value) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const sanitized: Record<string, unknown> = {};
      for (const k of Object.keys(value)) {
        if (k !== '__proto__' && k !== 'constructor') {
          sanitized[k] = value[k];
        }
      }
      return sanitized;
    }
    return value;
  });
}

async function connectSSE(): Promise<void> {
  sseController?.abort();
  sseController = new AbortController();
  const signal = sseController.signal;

  while (!signal.aborted) {
    try {
      const res = await fetch(`${serverUrl()}/events`, {
        headers: authHeaders(),
        signal,
      });
      if (!res.ok || !res.body) {
        await delay(3000);
        continue;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const ev = sanitizeJson(line.slice(6));
                webviewProvider?.postMessage({ type: 'sseEvent', event: ev });
              } catch { /* skip malformed */ }
            }
          }
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) break;
      await delay(3000);
    }
  }
  sseController = null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toggleChat(): void {
  vscode.commands.executeCommand('workbench.view.extension.sentinel');
}

async function sendSelectionCmd(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }
  const selection = editor.selection;
  const text = editor.document.getText(selection);
  if (!text) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  const fileName = editor.document.fileName;
  const lang = editor.document.languageId;
  const selectionMsg = `File: ${fileName}\nLanguage: ${lang}\n\`\`\`${lang}\n${text}\n\`\`\``;

  if (!activeSessionId) {
    try {
      const session = await fetchApi<{ id: string }>('POST', '/session', {});
      activeSessionId = session.id;
      webviewProvider?.postMessage({ type: 'sessionCreated', session });
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  }

  try {
    await fetchApi('POST', `/session/${activeSessionId}/prompt_async`, { message: selectionMsg });
    webviewProvider?.postMessage({
      type: 'userMessage',
      text: selectionMsg,
      sessionId: activeSessionId,
    });
  } catch (err: unknown) {
    vscode.window.showErrorMessage(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
  }

  vscode.commands.executeCommand('workbench.view.extension.sentinel');
}

// --- Webview Provider ---

class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;

  resolveWebviewView(wv: vscode.WebviewView): void {
    this._view = wv;
    wv.webview.options = { enableScripts: true };
    wv.webview.html = getChatHtml();

    wv.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      try {
        await this.handleMessage(msg);
      } catch (err: unknown) {
        this.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    });

    wv.onDidDispose(() => {
      this._view = undefined;
    });

    if (serverStatus === 'connected') {
      this.postMessage({ type: 'connected' });
    }
  }

  postMessage(msg: Record<string, unknown>): void {
    this._view?.webview.postMessage(msg);
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type as string) {
      case 'init': {
        this.postMessage({ type: 'status', status: serverStatus });
        if (activeSessionId) {
          this.postMessage({ type: 'activeSession', sessionId: activeSessionId });
        }
        break;
      }
      case 'sendMessage': {
        const text = msg.text as string;
        if (!text) return;
        if (!activeSessionId) {
          const session = await fetchApi<{ id: string }>('POST', '/session', {});
          activeSessionId = session.id;
          this.postMessage({ type: 'sessionCreated', session });
        }
        const sid = activeSessionId;
        this.postMessage({ type: 'userMessage', text, sessionId: sid });
        const data = await fetchApi<{ response?: string }>('POST', `/session/${sid}/message`, { message: text });
        if (data.response) {
          this.postMessage({ type: 'assistantMessage', text: data.response, sessionId: sid });
        }
        break;
      }
      case 'createSession': {
        const session = await fetchApi<{ id: string }>('POST', '/session', {});
        activeSessionId = session.id;
        this.postMessage({ type: 'sessionCreated', session });
        break;
      }
      case 'switchSession': {
        const sid = msg.sessionId as string;
        activeSessionId = sid;
        const data = await fetchApi<{ messages?: Array<{ role: string; content: string }> }>('GET', `/session/${sid}`);
        this.postMessage({ type: 'sessionData', sessionId: sid, messages: data.messages ?? [] });
        break;
      }
      case 'deleteSession': {
        const sid = msg.sessionId as string;
        await fetchApi('DELETE', `/session/${sid}`);
        if (activeSessionId === sid) activeSessionId = null;
        this.postMessage({ type: 'sessionDeleted', sessionId: sid });
        break;
      }
      case 'loadSessions': {
        const data = await fetchApi<{ sessions: Array<Record<string, unknown>> }>('GET', '/session');
        this.postMessage({ type: 'sessions', sessions: data.sessions ?? [] });
        break;
      }
      case 'abort': {
        if (activeSessionId) {
          await fetchApi('POST', `/session/${activeSessionId}/abort`, {});
        }
        break;
      }
    }
  }
}

function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d1117;--surface:#161b22;--surface-2:#1c2333;--border:#30363d;--text:#c9d1d9;--text-dim:#8b949e;--accent:#58a6ff;--accent-hover:#79c0ff;--success:#3fb950;--error:#f85149;--warning:#d29922;--radius:6px;--font:system-ui,-apple-system,sans-serif;--mono:ui-monospace,'SF Mono',Menlo,monospace}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);font-size:13px;line-height:1.5;overflow:hidden}
#app{display:flex;flex-direction:column;height:100vh}
#header{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface);min-height:36px}
#status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
#status-dot.offline{background:var(--error)}
#status-dot.connecting{background:var(--warning)}
#status-dot.online{background:var(--success)}
#status-label{font-size:11px;color:var(--text-dim);flex:1}
#msg-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
#msg-list:empty::after{content:'Send a message to start';display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:12px}
.msg{padding:8px 10px;border-radius:var(--radius);font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-width:95%}
.msg.user{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:3px}
.msg.assistant{background:var(--surface-2);border:1px solid var(--border);align-self:flex-start;border-bottom-left-radius:3px}
.msg.system{background:rgba(210,153,34,.12);border:1px solid rgba(210,153,34,.25);align-self:center;font-size:11px;color:var(--warning);text-align:center;width:100%}
.msg .role{font-size:9px;text-transform:uppercase;color:var(--text-dim);margin-bottom:3px;font-weight:600;letter-spacing:.4px}
.msg.user .role{color:rgba(255,255,255,.7)}
#input-area{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--border);background:var(--surface)}
#msg-input{flex:1;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font);font-size:12px;resize:none;min-height:32px;max-height:120px;line-height:1.4}
#msg-input:focus{outline:none;border-color:var(--accent)}
#msg-input::placeholder{color:var(--text-dim)}
#send-btn{padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap;height:32px}
#send-btn:hover{background:var(--accent-hover)}
#send-btn:disabled{opacity:.4;cursor:not-allowed}
#send-btn.sending{background:var(--warning)}
#sessions-bar{display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface);align-items:center;overflow-x:auto}
#sessions-bar::-webkit-scrollbar{height:2px}
.s-btn{padding:3px 8px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-dim);cursor:pointer;font-size:10px;white-space:nowrap;font-family:var(--font)}
.s-btn:hover{background:var(--surface-2);color:var(--text)}
.s-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.s-btn.del{margin-left:auto;color:var(--error)}
.s-btn.del:hover{background:rgba(248,81,73,.15)}
.loading{color:var(--text-dim);font-size:11px;padding:4px 0;animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
</style>
</head>
<body>
<div id="app">
  <div id="header">
    <span id="status-dot" class="offline"></span>
    <span id="status-label">Offline</span>
  </div>
  <div id="sessions-bar">
    <button class="s-btn" id="new-session-btn">+ New</button>
    <div id="session-btns" style="display:flex;gap:4px;flex:1;overflow-x:auto"></div>
    <button class="s-btn del" id="refresh-btn" title="Refresh sessions">&#x21bb;</button>
  </div>
  <div id="msg-list"></div>
  <div id="input-area">
    <textarea id="msg-input" placeholder="Ask Sentinel..." rows="1"></textarea>
    <button id="send-btn" disabled>Send</button>
  </div>
</div>
<script>
(function(){
const vsc=acquireVsCodeApi();
const $=(s)=>document.querySelector(s);
const statusDot=$('#status-dot');
const statusLabel=$('#status-label');
const msgList=$('#msg-list');
const input=$('#msg-input');
const sendBtn=$('#send-btn');
const sessionBtns=$('#session-btns');

let state={sessions:[],activeId:null,sending:false,streamingEl:null,streamingText:''};

function setStatus(s){
  statusDot.className=s;
  const labels={offline:'Offline',connecting:'Connecting...',online:'Connected'};
  statusLabel.textContent=labels[s]||s;
}

function post(m){vsc.postMessage(m)}

function scrollBottom(){requestAnimationFrame(()=>{msgList.scrollTop=msgList.scrollHeight})}

function addMsg(role,text){
  const el=document.createElement('div');
  el.className='msg '+role;
  el.innerHTML='<div class="role">'+(role==='user'?'You':'Assistant')+'</div><div class="content"></div>';
  el.querySelector('.content').textContent=text;
  msgList.appendChild(el);
  scrollBottom();
  return el;
}

function renderSessions(){
  sessionBtns.innerHTML='';
  for(const s of state.sessions){
    const btn=document.createElement('button');
    btn.className='s-btn'+(s.id===state.activeId?' active':'');
    const label=(s.title||s.id||'').length>16?s.title.slice(0,16)+'…':(s.title||s.id||'Session');
    btn.textContent=label;
    btn.title=s.id;
    btn.addEventListener('click',()=>post({type:'switchSession',sessionId:s.id}));
    sessionBtns.appendChild(btn);
  }
}

post({type:'init'});

window.addEventListener('message',(e)=>{
  const msg=e.data;
  switch(msg.type){
    case 'status':{
      if(msg.status==='connected')setStatus('online');
      else if(msg.status==='starting')setStatus('connecting');
      else setStatus('offline');
      break;
    }
    case 'connected':setStatus('online');post({type:'loadSessions'});break;
    case 'sseEvent':handleSSE(msg.event);break;
    case 'sessions':state.sessions=msg.sessions||[];renderSessions();break;
    case 'sessionCreated':{
      state.activeId=msg.session.id;
      renderSessions();
      sendBtn.disabled=false;
      input.focus();
      post({type:'loadSessions'});
      break;
    }
    case 'sessionData':{
      state.activeId=msg.sessionId;
      msgList.innerHTML='';
      for(const m of (msg.messages||[])){
        if(m.role==='user')addMsg('user',m.content);
        else if(m.role==='assistant')addMsg('assistant',m.content);
      }
      renderSessions();
      scrollBottom();
      break;
    }
    case 'sessionDeleted':{
      if(state.activeId===msg.sessionId)state.activeId=null;
      post({type:'loadSessions'});
      if(!state.activeId)sendBtn.disabled=true;
      break;
    }
    case 'userMessage':{
      if(!state.activeId&&msg.sessionId)state.activeId=msg.sessionId;
      addMsg('user',msg.text);
      sendBtn.textContent='Sending…';
      sendBtn.classList.add('sending');
      sendBtn.disabled=true;
      state.sending=true;
      renderSessions();
      break;
    }
    case 'assistantMessage':{
      sendBtn.textContent='Send';
      sendBtn.classList.remove('sending');
      sendBtn.disabled=false;
      state.sending=false;
      addMsg('assistant',msg.text);
      state.streamingEl=null;
      state.streamingText='';
      break;
    }
    case 'error':{
      sendBtn.textContent='Send';
      sendBtn.classList.remove('sending');
      sendBtn.disabled=false;
      state.sending=false;
      addMsg('system','Error: '+msg.message);
      state.streamingEl=null;
      state.streamingText='';
      break;
    }
    case 'activeSession':{
      state.activeId=msg.sessionId;
      sendBtn.disabled=false;
      break;
    }
  }
});

function handleSSE(ev){
  if(!state.activeId||ev.turnId!==state.activeId)return;
  switch(ev.type){
    case 'text_delta':{
      if(!state.streamingEl){
        state.streamingText='';
        const el=document.createElement('div');
        el.className='msg assistant';
        el.innerHTML='<div class="role">Assistant</div><div class="content"></div>';
        msgList.appendChild(el);
        scrollBottom();
        state.streamingEl=el;
      }
      state.streamingText+=ev.delta;
      state.streamingEl.querySelector('.content').textContent=state.streamingText;
      scrollBottom();
      break;
    }
    case 'turn_end':{
      state.streamingEl=null;
      state.streamingText='';
      state.sending=false;
      sendBtn.textContent='Send';
      sendBtn.classList.remove('sending');
      sendBtn.disabled=false;
      break;
    }
    case 'error':{
      addMsg('system','Error: '+(ev.message||'Unknown'));
      state.streamingEl=null;
      state.streamingText='';
      state.sending=false;
      sendBtn.textContent='Send';
      sendBtn.classList.remove('sending');
      sendBtn.disabled=false;
      break;
    }
  }
}

function sendMessage(){
  const text=input.value.trim();
  if(!text||state.sending)return;
  input.value='';
  input.style.height='auto';
  if(!state.activeId){
    post({type:'createSession'});
    setTimeout(()=>{if(state.activeId)post({type:'sendMessage',text})},100);
    return;
  }
  post({type:'sendMessage',text});
}

sendBtn.addEventListener('click',sendMessage);
input.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}
});
input.addEventListener('input',()=>{
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,120)+'px';
});
$('#new-session-btn').addEventListener('click',()=>post({type:'createSession'}));
$('#refresh-btn').addEventListener('click',()=>post({type:'loadSessions'}));
})();
</script>
</body>
</html>`;
}
