export interface IDEMessage {
  type: 'request' | 'response' | 'notification';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export class IDEProtocol {
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
    if (msg.error) {
      handler.reject(new Error(msg.error.message));
    } else {
      handler.resolve(msg.result);
    }
  }

  dispose(): void {
    for (const [, handler] of this.pending) {
      handler.reject(new Error('Protocol disposed'));
    }
    this.pending.clear();
  }
}

export const IDE_METHODS = {
  // IDE → Sentinel
  EDITOR_GET_STATE: 'editor/getState',
  EDITOR_GET_FILE: 'editor/getFile',
  EDITOR_GET_SELECTION: 'editor/getSelection',
  EDITOR_GET_DIAGNOSTICS: 'editor/getDiagnostics',
  EDITOR_GET_TERMINAL: 'editor/getTerminal',
  EDITOR_GET_GIT: 'editor/getGit',

  // Sentinel → IDE
  EDITOR_OPEN_FILE: 'editor/openFile',
  EDITOR_REPLACE_TEXT: 'editor/replaceText',
  EDITOR_SHOW_DIFF: 'editor/showDiff',
  EDITOR_APPLY_DIFF: 'editor/applyDiff',
  EDITOR_SHOW_MESSAGE: 'editor/showMessage',
  EDITOR_SET_DIAGNOSTICS: 'editor/setDiagnostics',
  EDITOR_GET_USER_INPUT: 'editor/getUserInput',
  EDITOR_SHOW_QUICK_PICK: 'editor/showQuickPick',
} as const;
