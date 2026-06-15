import { describe, it, expect, vi } from 'vitest';
import { IDEProtocol, IDE_METHODS } from './ide-shared.js';

describe('IDEProtocol', () => {
  it('sends a request and resolves with result', async () => {
    const send = vi.fn();
    const proto = new IDEProtocol(send);

    const resultPromise = proto.request('editor/getState', { file: 'test.ts' });
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]![0]!;
    expect(sent.type).toBe('request');
    expect(sent.method).toBe('editor/getState');
    expect(sent.params).toEqual({ file: 'test.ts' });
    expect(sent.id).toBeDefined();

    proto.handleResponse({ type: 'response', id: sent.id, result: { language: 'typescript' } });
    const result = await resultPromise;
    expect(result).toEqual({ language: 'typescript' });
  });

  it('rejects on error response', async () => {
    const send = vi.fn();
    const proto = new IDEProtocol(send);

    const resultPromise = proto.request('editor/openFile');
    const sent = send.mock.calls[0]![0]!;

    proto.handleResponse({ type: 'response', id: sent.id, error: { code: -1, message: 'file not found' } });
    await expect(resultPromise).rejects.toThrow('file not found');
  });

  it('sends a notification', () => {
    const send = vi.fn();
    const proto = new IDEProtocol(send);

    proto.notify('editor/showMessage', { text: 'hello' });
    expect(send).toHaveBeenCalledWith({
      type: 'notification',
      method: 'editor/showMessage',
      params: { text: 'hello' },
    });
  });

  it('ignores responses without matching id', () => {
    const send = vi.fn();
    const proto = new IDEProtocol(send);
    proto.request('editor/getState');
    expect(() => proto.handleResponse({ type: 'response', id: 'nonexistent', result: null })).not.toThrow();
  });

  it('dispose rejects all pending requests', async () => {
    const send = vi.fn();
    const proto = new IDEProtocol(send);

    const p1 = proto.request('editor/getFile');
    const p2 = proto.request('editor/getSelection');
    proto.dispose();

    await expect(p1).rejects.toThrow('Protocol disposed');
    await expect(p2).rejects.toThrow('Protocol disposed');
  });

  it('has correct method constants', () => {
    expect(IDE_METHODS.EDITOR_GET_STATE).toBe('editor/getState');
    expect(IDE_METHODS.EDITOR_OPEN_FILE).toBe('editor/openFile');
    expect(IDE_METHODS.EDITOR_REPLACE_TEXT).toBe('editor/replaceText');
    expect(IDE_METHODS.EDITOR_SHOW_DIFF).toBe('editor/showDiff');
    expect(IDE_METHODS.EDITOR_APPLY_DIFF).toBe('editor/applyDiff');
    expect(IDE_METHODS.EDITOR_SHOW_MESSAGE).toBe('editor/showMessage');
    expect(IDE_METHODS.EDITOR_SET_DIAGNOSTICS).toBe('editor/setDiagnostics');
    expect(IDE_METHODS.EDITOR_GET_USER_INPUT).toBe('editor/getUserInput');
    expect(IDE_METHODS.EDITOR_SHOW_QUICK_PICK).toBe('editor/showQuickPick');
  });
});
