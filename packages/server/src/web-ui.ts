import { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_MODEL } from '@sentinel/shared';

export function serveWebUi(_req: IncomingMessage, res: ServerResponse): void {
  const html = getWebUiHtml();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

function getWebUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sentinel</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d1117;--surface:#161b22;--surface-2:#1c2333;--border:#30363d;--text:#c9d1d9;--text-dim:#8b949e;--accent:#58a6ff;--accent-hover:#79c0ff;--success:#3fb950;--error:#f85149;--warning:#d29922;--cyan:#39d2c0;--radius:6px;--font:system-ui,-apple-system,sans-serif;--mono:ui-monospace,'SF Mono',Menlo,monospace}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.5}
#app{display:flex;height:100vh;overflow:hidden}
#sidebar{width:280px;min-width:280px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:transform .2s}
#sidebar.hidden{transform:translateX(-100%);position:absolute;z-index:100;height:100%}
.sidebar-header{padding:16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px}
.sidebar-header h2{font-size:16px;font-weight:600;white-space:nowrap}
#status-indicator{display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:12px;white-space:nowrap}
#status-indicator::before{content:'';width:6px;height:6px;border-radius:50%}
.status-connected{background:rgba(63,185,80,.15);color:var(--success)}
.status-connected::before{background:var(--success)}
.status-disconnected{background:rgba(248,81,73,.15);color:var(--error)}
.status-disconnected::before{background:var(--error)}
.status-reconnecting{background:rgba(210,153,34,.15);color:var(--warning)}
.status-reconnecting::before{background:var(--warning)}
.sidebar-section{padding:12px 16px;border-bottom:1px solid var(--border)}
.section-title{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;letter-spacing:.5px}
#new-session-btn{width:100%;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:500;margin-bottom:8px}
#new-session-btn:hover{background:var(--accent-hover)}
.session-item{padding:8px 10px;border-radius:var(--radius);cursor:pointer;font-size:13px;margin-bottom:2px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.session-item:hover{background:var(--surface-2)}
.session-item.active{background:var(--surface-2);border-left:2px solid var(--accent)}
.session-item .session-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.session-item .session-delete{background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:0 4px;display:none}
.session-item:hover .session-delete{display:block}
.session-item .session-delete:hover{color:var(--error)}
.config-group{margin-bottom:10px}
.config-group label{display:block;font-size:12px;color:var(--text-dim);margin-bottom:3px}
.config-group input,.config-group select{width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:13px;font-family:var(--font)}
.config-group input:focus,.config-group select:focus{outline:none;border-color:var(--accent)}
#save-config-btn{width:100%;padding:7px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);cursor:pointer;font-size:13px;margin-top:4px}
#save-config-btn:hover{background:var(--border)}
#main{flex:1;display:flex;flex-direction:column;min-width:0}
#chat-header{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:var(--surface);min-height:48px}
#sidebar-toggle{display:none;background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:4px}
#session-title{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#message-list{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.message{max-width:85%;padding:10px 14px;border-radius:var(--radius);line-height:1.5;font-size:13px;white-space:pre-wrap;word-break:break-word;position:relative}
.message.user{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.message.assistant{background:var(--surface-2);border:1px solid var(--border);align-self:flex-start;border-bottom-left-radius:4px}
.message.tool{background:rgba(57,210,192,.08);border:1px solid rgba(57,210,192,.2);align-self:flex-start;font-family:var(--mono);font-size:12px;width:100%;border-radius:var(--radius)}
.message .msg-role{font-size:10px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;font-weight:600}
.message .msg-time{font-size:10px;color:var(--text-dim);margin-top:4px;text-align:right}
.tool-header{display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:4px 0}
.tool-header:hover{opacity:.8}
.tool-header .arrow{transition:transform .15s;font-size:10px}
.tool-header .arrow.expanded{transform:rotate(90deg)}
.tool-details{display:none;margin-top:6px;padding:8px;background:rgba(0,0,0,.3);border-radius:4px;font-size:12px;overflow-x:auto}
.tool-details.open{display:block}
.tool-details pre{margin:4px 0;white-space:pre-wrap;word-break:break-all}
.token-cost{font-size:11px;color:var(--text-dim);padding:8px 16px;border-top:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap}
.token-cost span{display:flex;align-items:center;gap:4px}
#input-area{padding:12px 16px;border-top:1px solid var(--border);background:var(--surface);display:flex;gap:8px;align-items:flex-end}
#message-input{flex:1;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font);font-size:13px;resize:none;min-height:42px;max-height:200px;line-height:1.4}
#message-input:focus{outline:none;border-color:var(--accent)}
#message-input::placeholder{color:var(--text-dim)}
#send-btn{padding:10px 20px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;height:42px}
#send-btn:hover{background:var(--accent-hover)}
#send-btn:disabled{opacity:.5;cursor:not-allowed}
#send-btn.sending{background:var(--warning)}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;width:360px;max-width:90vw}
.modal-box h3{margin-bottom:16px;font-size:16px}
.modal-box input{width:100%;padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;margin-bottom:12px}
.modal-box input:focus{outline:none;border-color:var(--accent)}
.modal-box .modal-actions{display:flex;gap:8px;justify-content:flex-end}
.modal-box button{padding:8px 16px;border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:500}
.modal-box .btn-primary{background:var(--accent);color:#fff;border:none}
.modal-box .btn-primary:hover{background:var(--accent-hover)}
.modal-box .btn-secondary{background:var(--surface-2);color:var(--text);border:1px solid var(--border)}
.modal-box .btn-secondary:hover{background:var(--border)}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--text-dim);gap:8px;text-align:center;padding:32px}
.empty-state .icon{font-size:40px;opacity:.3}
.empty-state p{font-size:13px}
@media(max-width:768px){
#sidebar{position:fixed;left:0;top:0;height:100%;z-index:100;transform:translateX(-100%);width:280px}
#sidebar.open{transform:translateX(0)}
#sidebar-toggle{display:block}
.message{max-width:95%}
.token-cost{flex-direction:column;gap:4px}
#input-area{flex-direction:column}
#send-btn{width:100%}
}
@media(max-width:480px){
.sidebar-header h2{font-size:14px}
#message-list{padding:12px}
.message{padding:8px 12px;font-size:12px}
}
</style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <div class="sidebar-header">
      <h2>Sentinel</h2>
      <span id="status-indicator" class="status-disconnected">Disconnected</span>
    </div>
    <div class="sidebar-section">
      <div class="section-title">Sessions</div>
      <button id="new-session-btn">+ New Session</button>
      <div id="sessions-container"></div>
    </div>
    <div class="sidebar-section" style="flex:1;overflow-y:auto">
      <div class="section-title">Config</div>
      <div class="config-group">
        <label for="config-model">Model</label>
        <input type="text" id="config-model" value="${DEFAULT_MODEL}">
      </div>
      <div class="config-group">
        <label for="config-provider">Provider</label>
        <select id="config-provider">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="vertex">Vertex AI</option>
          <option value="bedrock">Bedrock</option>
        </select>
      </div>
      <div class="config-group">
        <label for="config-mode">Mode</label>
        <select id="config-mode">
          <option value="full">Full</option>
          <option value="plan">Plan</option>
          <option value="research">Research</option>
        </select>
      </div>
      <div class="config-group">
        <label for="config-max-turns">Max Turns</label>
        <input type="number" id="config-max-turns" value="50" min="1" max="200">
      </div>
      <button id="save-config-btn">Update Config</button>
    </div>
  </aside>
  <main id="main">
    <div id="chat-header">
      <button id="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button>
      <span id="session-title">Select or create a session</span>
    </div>
    <div id="message-list">
      <div class="empty-state">
        <div class="icon">&#9632;</div>
        <p>Create a new session to get started</p>
      </div>
    </div>
    <div id="token-cost" class="token-cost" style="display:none">
      <span>Tokens: <strong id="token-input">0</strong> in / <strong id="token-output">0</strong> out</span>
      <span>Cost: $<strong id="cost-display">0.0000</strong></span>
    </div>
    <div id="input-area">
      <textarea id="message-input" placeholder="Type a message... (Enter to send, Shift+Enter for newline)" rows="1"></textarea>
      <button id="send-btn" disabled>Send</button>
    </div>
  </main>
</div>
<div id="auth-modal" class="modal-overlay">
  <div class="modal-box">
    <h3>Authentication Required</h3>
    <p style="color:var(--text-dim);margin-bottom:12px;font-size:13px">Enter the server password to connect.</p>
    <input type="password" id="password-input" placeholder="Server password" autocomplete="off">
    <div class="modal-actions">
      <button class="btn-secondary" id="auth-cancel">Cancel</button>
      <button class="btn-primary" id="auth-submit">Connect</button>
    </div>
  </div>
</div>
<script>
(function(){
"use strict";

function getAuthHeader(){
  const pwd=sessionStorage.getItem('sentinel_password');
  return pwd ? 'Basic '+btoa(':'+pwd) : '';
}

function setPassword(pwd){
  sessionStorage.setItem('sentinel_password',pwd);
}

function getPassword(){
  return sessionStorage.getItem('sentinel_password');
}

function clearPassword(){
  sessionStorage.removeItem('sentinel_password');
}

async function api(method,path,body){
  const headers={'Content-Type':'application/json'};
  const auth=getAuthHeader();
  if(auth) headers['Authorization']=auth;
  if(body) headers['X-Idempotency-Key']=crypto.randomUUID();
  const opts={method,headers};
  if(body!==undefined) opts.body=JSON.stringify(body);
  const res=await fetch(path,opts);
  if(res.status===401){
    clearPassword();
    showAuthModal();
    throw new Error('Authentication required');
  }
  const json=await res.json();
  if(json.error) throw new Error(json.error.message);
  return json.data;
}

// State
let state={
  sessions:[],
  activeId:null,
  messages:[],
  config:null,
  sending:false,
  sseReader:null,
  connected:false,
  reconnecting:false,
};
let reconnectTimer=null;
let initTimer=null;

// DOM refs
const $=(s)=>document.querySelector(s);
const $$=(s)=>document.querySelectorAll(s);
const msgList=$('#message-list');
const sessionTitle=$('#session-title');
const sessionContainer=$('#sessions-container');
const input=$('#message-input');
const sendBtn=$('#send-btn');
const statusEl=$('#status-indicator');
const tokenCost=$('#token-cost');
const tokenInput=$('#token-input');
const tokenOutput=$('#token-output');
const costDisplay=$('#cost-display');
const configModel=$('#config-model');
const configProvider=$('#config-provider');
const configMode=$('#config-mode');
const configMaxTurns=$('#config-max-turns');
const authModal=$('#auth-modal');
const passwordInput=$('#password-input');

// Status
function setStatus(type,label){
  statusEl.className='status-'+type;
  statusEl.textContent=label;
}

setStatus('disconnected','Disconnected');

// Auth
function showAuthModal(){
  authModal.classList.add('open');
  passwordInput.value='';
  passwordInput.focus();
}

function hideAuthModal(){
  authModal.classList.remove('open');
}

$('#auth-submit').addEventListener('click',()=>{
  const pwd=passwordInput.value.trim();
  if(!pwd) return;
  setPassword(pwd);
  hideAuthModal();
  init();
});

$('#auth-cancel').addEventListener('click',hideAuthModal);

passwordInput.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    $('#auth-submit').click();
  }
});

function sanitizeJson(raw){return JSON.parse(raw,(_key,value)=>{if(typeof value==='object'&&value!==null&&!Array.isArray(value)){const s={};for(const k of Object.keys(value)){if(k!=='__proto__'&&k!=='constructor')s[k]=value[k]}return s}return value})}

// SSE
async function connectSSE(){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
  if(state.sseReader) return;
  const auth=getAuthHeader();
  const headers={};
  if(auth) headers['Authorization']=auth;

  try{
    const res=await fetch('/events',{headers});
    if(res.status===401){
      clearPassword();
      showAuthModal();
      return;
    }
    if(!res.ok) throw new Error('SSE connection failed: '+res.status);
    state.connected=true;
    state.reconnecting=false;
    setStatus('connected','Connected');
    const reader=res.body.getReader();
    state.sseReader=reader;
    const decoder=new TextDecoder();
    let buf='';

    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      buf+=decoder.decode(value,{stream:true});
      const parts=buf.split('\\n\\n');
      buf=parts.pop()||'';
      for(const part of parts){
        for(const line of part.split('\\n')){
          if(line.startsWith('data: ')){
            try{
              const ev=sanitizeJson(line.slice(6));
              handleSSEEvent(ev);
            }catch(_){
              // skip malformed SSE events
            }
          }
        }
      }
    }
  }catch(err){
    state.connected=false;
    state.sseReader=null;
    setStatus('disconnected','Disconnected');
    if(!state.reconnecting){
      state.reconnecting=true;
      setStatus('reconnecting','Reconnecting...');
      reconnectTimer=setTimeout(connectSSE,3000);
    }
  }
}

function handleSSEEvent(event){
  if(!state.activeId) return;
  if(event.turnId!==state.activeId) return;

  switch(event.type){
    case 'text_delta':
      appendStreamingText(event.delta);
      break;
    case 'tool_start':
      addToolMessage(event);
      break;
    case 'tool_result':
      updateToolResult(event);
      break;
    case 'error':
      addErrorMessage(event.message||'An error occurred');
      break;
    case 'turn_end':
      finalizeTurn();
      break;
  }
}

// Message management
let streamingMsgEl=null;
let streamingContent='';

function appendStreamingText(delta){
  if(!streamingMsgEl){
    streamingContent='';
    streamingMsgEl=document.createElement('div');
    streamingMsgEl.className='message assistant';
    streamingMsgEl.innerHTML='<div class="msg-role">Assistant</div><div class="msg-content"></div>';
    msgList.appendChild(streamingMsgEl);
    scrollToBottom();
  }
  streamingContent+=delta;
  streamingMsgEl.querySelector('.msg-content').textContent=streamingContent;
  scrollToBottom();
}

function finalizeTurn(){
  streamingMsgEl=null;
  streamingContent='';
  state.sending=false;
  updateSendBtn();
}

function addToolMessage(event){
  const el=document.createElement('div');
  el.className='message tool';
  el.dataset.toolId=event.toolId||'';
  el.innerHTML=\`
    <div class="tool-header">
      <span class="arrow">&#9654;</span>
      <span class="tool-name" style="font-weight:600;font-family:var(--font)"></span>
    </div>
    <div class="tool-details">
      <pre>Running...</pre>
    </div>
  \`;
  el.querySelector('.tool-name').textContent = event.tool||event.name||'Tool';
  el.querySelector('.tool-details pre').textContent = 'Running ' + (event.tool||event.name||'Tool') + '...';
  el.querySelector('.tool-header').addEventListener('click',()=>{
    const details=el.querySelector('.tool-details');
    const arrow=el.querySelector('.arrow');
    details.classList.toggle('open');
    arrow.classList.toggle('expanded');
  });
  msgList.appendChild(el);
  scrollToBottom();
}

function updateToolResult(event){
  const tools=msgList.querySelectorAll('.message.tool');
  for(const el of tools){
    if(el.dataset.toolId===event.toolId){
      const details=el.querySelector('.tool-details pre');
      if(details){
        const result=event.result||event.output||'Done';
        details.textContent=typeof result==='string'?result:JSON.stringify(result,null,2);
      }
      break;
    }
  }
}

function addUserMessage(text){
  const el=document.createElement('div');
  el.className='message user';
  el.innerHTML='<div class="msg-role">You</div><div class="msg-content"></div>';
  el.querySelector('.msg-content').textContent=text;
  const time=document.createElement('div');
  time.className='msg-time';
  time.textContent=new Date().toLocaleTimeString();
  el.appendChild(time);
  msgList.appendChild(el);
  scrollToBottom();
}

function addErrorMessage(text){
  const el=document.createElement('div');
  el.className='message assistant';
  el.style.borderColor='var(--error)';
  el.innerHTML='<div class="msg-role" style="color:var(--error)">Error</div><div class="msg-content"></div>';
  el.querySelector('.msg-content').textContent=text;
  msgList.appendChild(el);
  scrollToBottom();
}

function clearMessages(){
  msgList.innerHTML='';
  streamingMsgEl=null;
  streamingContent='';
  tokenCost.style.display='none';
}

// Scroll
function scrollToBottom(){
  requestAnimationFrame(()=>{
    msgList.scrollTop=msgList.scrollHeight;
  });
}

// Session management
function renderSessions(){
  sessionContainer.innerHTML='';
  if(!state.sessions.length){
    const empty=document.createElement('div');
    empty.style.cssText='padding:16px 0;text-align:center;color:var(--text-dim);font-size:12px';
    empty.textContent='No sessions yet';
    sessionContainer.appendChild(empty);
    return;
  }

  for(const s of state.sessions){
    const el=document.createElement('div');
    el.className='session-item'+(s.id===state.activeId?' active':'');
    const name=s.name||s.id||'Session';
    const display=name.length>20?name.slice(0,20)+'...':name;
    const nameSpan=document.createElement('span');
    nameSpan.className='session-name';
    nameSpan.textContent=display;
    const delBtn=document.createElement('button');
    delBtn.className='session-delete';
    delBtn.textContent='\u00D7';
    delBtn.dataset.id=s.id;
    el.append(nameSpan,delBtn);
    el.addEventListener('click',(e)=>{
      if(e.target.closest('.session-delete')) return;
      switchSession(s.id);
    });
    el.querySelector('.session-delete').addEventListener('click',async (e)=>{
      e.stopPropagation();
      if(confirm('Delete this session?')){
        try{
          await api('DELETE','/session/'+s.id);
          if(state.activeId===s.id){
            state.activeId=null;
            state.messages=[];
            clearMessages();
            sessionTitle.textContent='Select or create a session';
            sendBtn.disabled=true;
          }
          await loadSessions();
        }catch(err){
          console.error('Delete failed:',err);
        }
      }
    });
    sessionContainer.appendChild(el);
  }
}

async function loadSessions(){
  try{
    const data=await api('GET','/session');
    const active=data.active||[];
    const saved=data.saved||[];
    state.sessions=[...active,...saved];
    renderSessions();
  }catch(err){
    console.error('Failed to load sessions:',err);
  }
}

async function switchSession(id){
  if(state.activeId===id) return;
  state.activeId=id;
  clearMessages();
  sendBtn.disabled=false;
  sessionTitle.textContent='Session: '+(id.length>30?id.slice(0,30)+'...':id);
  renderSessions();

  try{
    const data=await api('GET','/session/'+id);
    state.messages=data.messages||[];
    renderMessages();
    if(data.tokenCounts){
      tokenInput.textContent=data.tokenCounts.input||0;
      tokenOutput.textContent=data.tokenCounts.output||0;
    }
    if(data.cost!==undefined){
      costDisplay.textContent=data.cost.toFixed(4);
    }
    tokenCost.style.display='flex';
  }catch(err){
    console.error('Failed to load session:',err);
    tokenCost.style.display='none';
  }
}

function renderMessages(){
  msgList.innerHTML='';
  let hasContent=false;
  for(const msg of state.messages){
    if(msg.role==='user'){
      addUserMessage(msg.content);
      hasContent=true;
    }else if(msg.role==='assistant'){
      const el=document.createElement('div');
      el.className='message assistant';
      el.innerHTML='<div class="msg-role">Assistant</div><div class="msg-content"></div>';
      el.querySelector('.msg-content').textContent=msg.content||'';
      const time=document.createElement('div');
      time.className='msg-time';
      time.textContent=new Date().toLocaleTimeString();
      el.appendChild(time);
      msgList.appendChild(el);
      hasContent=true;
    }
  }
  if(!hasContent){
    msgList.innerHTML='<div class="empty-state"><div class="icon">&#9998;</div><p>Send a message to start the conversation</p></div>';
  }
  scrollToBottom();
}

// Send message
async function sendMessage(text){
  if(!text.trim()||!state.activeId||state.sending) return;
  state.sending=true;
  updateSendBtn();
  addUserMessage(text);
  input.value='';
  input.style.height='auto';

  // Remove empty state
  const empty=msgList.querySelector('.empty-state');
  if(empty) empty.remove();

  try{
    const data=await api('POST','/session/'+state.activeId+'/message',{message:text});
    if(data.response){
      if(!streamingMsgEl){
        appendStreamingText('');
      }
      streamingMsgEl.querySelector('.msg-content').textContent=data.response;
      streamingContent=data.response;
    }
    finalizeTurn();
    if(data.tokenCounts){
      tokenInput.textContent=data.tokenCounts.input||tokenInput.textContent;
      tokenOutput.textContent=data.tokenCounts.output||tokenOutput.textContent;
    }
    if(data.cost!==undefined){
      costDisplay.textContent=data.cost.toFixed(4);
    }
    tokenCost.style.display='flex';
  }catch(err){
    finalizeTurn();
    addErrorMessage(err.message);
  }
  state.sending=false;
  updateSendBtn();
}

function updateSendBtn(){
  if(state.sending){
    sendBtn.textContent='Sending...';
    sendBtn.classList.add('sending');
    sendBtn.disabled=true;
  }else{
    sendBtn.textContent='Send';
    sendBtn.classList.remove('sending');
    sendBtn.disabled=!state.activeId;
  }
}

// Input handling
sendBtn.addEventListener('click',()=>sendMessage(input.value));

input.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    sendMessage(input.value);
  }
});

input.addEventListener('input',()=>{
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,200)+'px';
});

// Config
async function loadConfig(){
  try{
    const data=await api('GET','/config');
    state.config=data;
    if(data.model) configModel.value=data.model;
    if(data.provider) configProvider.value=data.provider;
    if(data.mode) configMode.value=data.mode;
    if(data.maxTurns) configMaxTurns.value=data.maxTurns;
  }catch(err){
    console.error('Failed to load config:',err);
  }
}

async function saveConfig(){
  try{
    const data=await api('PATCH','/config',{
      model:configModel.value.trim(),
      provider:configProvider.value,
      mode:configMode.value,
      maxTurns:parseInt(configMaxTurns.value,10)||50,
    });
    state.config=data;
  }catch(err){
    console.error('Failed to save config:',err);
  }
}

$('#save-config-btn').addEventListener('click',saveConfig);

// New session
$('#new-session-btn').addEventListener('click',async ()=>{
  try{
    const data=await api('POST','/session',{});
    await loadSessions();
    await switchSession(data.id);
  }catch(err){
    console.error('Failed to create session:',err);
  }
});

// Sidebar toggle
$('#sidebar-toggle').addEventListener('click',()=>{
  const sidebar=$('#sidebar');
  sidebar.classList.toggle('open');
});

// Close sidebar on outside click on mobile
document.addEventListener('click',(e)=>{
  const sidebar=$('#sidebar');
  if(window.innerWidth>768) return;
  if(sidebar.classList.contains('open')&&!sidebar.contains(e.target)&&e.target!==$('#sidebar-toggle')){
    sidebar.classList.remove('open');
  }
});

// Init
async function init(){
  if(initTimer){clearTimeout(initTimer);initTimer=null}
  const auth=getAuthHeader();
  if(!auth){
    // Try a request to see if auth is needed
    try{
      const res=await fetch('/health');
      if(res.status===401){
        showAuthModal();
        return;
      }
    }catch(_){
      setStatus('disconnected','Cannot connect');
      return;
    }
  }

  setStatus('reconnecting','Connecting...');
  try{
    await Promise.all([loadConfig(),loadSessions()]);
    connectSSE();
    setStatus('connected','Connected');
  }catch(err){
    if(err.message==='Authentication required') return;
    setStatus('disconnected','Connection failed');
    initTimer=setTimeout(init,3000);
  }
}

init();
})();
</script>
</body>
</html>`;
}
