import { describe, it, expect } from 'vitest';
import { homedir, hostname, userInfo } from 'os';
import { substConfigVars, substConfigObject } from './config-subst.js';

describe('substConfigVars', () => {
  it('substitutes ${HOME}', () => {
    expect(substConfigVars('${HOME}')).toBe(homedir());
  });

  it('substitutes ${USER}', () => {
    expect(substConfigVars('${USER}')).toBe(userInfo().username);
  });

  it('substitutes ${PID}', () => {
    expect(substConfigVars('${PID}')).toBe(String(process.pid));
  });

  it('substitutes ${HOSTNAME}', () => {
    expect(substConfigVars('${HOSTNAME}')).toBe(hostname());
  });

  it('substitutes ${OS}', () => {
    expect(substConfigVars('${OS}')).toBe(process.platform);
  });

  it('substitutes ${ARCH}', () => {
    expect(substConfigVars('${ARCH}')).toBe(process.arch);
  });

  it('substitutes ${SHELL}', () => {
    expect(substConfigVars('${SHELL}')).toBe(process.env.SHELL || '/bin/bash');
  });

  it('substitutes ${TIME} with ISO format', () => {
    const result = substConfigVars('${TIME}');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('substitutes ${UUID}', () => {
    const result = substConfigVars('${UUID}');
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('substitutes ${PROJECT_ROOT} with cwd', () => {
    expect(substConfigVars('${PROJECT_ROOT}')).toBe(process.cwd());
  });

  it('uses context.projectRoot for ${PROJECT_ROOT}', () => {
    expect(substConfigVars('${PROJECT_ROOT}', { projectRoot: '/custom' })).toBe('/custom');
  });

  it('is case-insensitive for ${projectRoot}', () => {
    expect(substConfigVars('${projectRoot}', { projectRoot: '/bar' })).toBe('/bar');
  });

  it('substitutes ${DATE} with ISO string', () => {
    const result = substConfigVars('${DATE}');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('substitutes ${DATE:YYYY-MM-DD} with formatted date', () => {
    const result = substConfigVars('${DATE:YYYY-MM-DD}');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('substitutes ${DATE:HH:mm:ss} with formatted time', () => {
    const result = substConfigVars('${DATE:HH:mm:ss}');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('substitutes ${RANDOM} with 8-char string', () => {
    const result = substConfigVars('${RANDOM}');
    expect(result).toHaveLength(8);
    expect(result).toMatch(/^[a-z0-9]+$/);
  });

  it('substitutes ${RANDOM:12} with 12-char string', () => {
    const result = substConfigVars('${RANDOM:12}');
    expect(result).toHaveLength(12);
  });

  it('substitutes ${ENV:PATH} with env var', () => {
    const result = substConfigVars('${ENV:PATH}');
    expect(result).toBe(process.env.PATH);
  });

  it('leaves missing ENV var as-is', () => {
    const result = substConfigVars('${ENV:THIS_VAR_DOES_NOT_EXIST_XYZ}');
    expect(result).toBe('${ENV:THIS_VAR_DOES_NOT_EXIST_XYZ}');
  });

  it('leaves unknown variable as-is', () => {
    const result = substConfigVars('${UNKNOWN_VAR}');
    expect(result).toBe('${UNKNOWN_VAR}');
  });

  it('leaves unmatched brace as-is', () => {
    const result = substConfigVars('${HOME');
    expect(result).toBe('${HOME');
  });

  it('does not substitute escaped \\${}', () => {
    const result = substConfigVars('\\${HOME}');
    expect(result).toBe('${HOME}');
  });

  it('substitutes escaped \\\\ then var', () => {
    const result = substConfigVars('\\\\${HOME}');
    expect(result).toBe('\\' + homedir());
  });

  it('substitutes in middle of text', () => {
    const result = substConfigVars('/home/${USER}/project');
    expect(result).toBe(`/home/${userInfo().username}/project`);
  });

  it('substitutes multiple vars in a single string', () => {
    const result = substConfigVars('${USER}@${HOSTNAME}');
    expect(result).toBe(`${userInfo().username}@${hostname()}`);
  });

  it('substitutes var in path', () => {
    const result = substConfigVars('path-${PID}-end');
    expect(result).toMatch(/^path-\d+-end$/);
  });

  it('resolves nested variable references', () => {
    process.env['TEST_NESTED_VAR'] = 'HOME';
    const result = substConfigVars('${${ENV:TEST_NESTED_VAR}}');
    expect(result).toBe(homedir());
    delete process.env['TEST_NESTED_VAR'];
  });
});

describe('substConfigObject', () => {
  it('substitutes all string values', () => {
    const obj = {
      path: '${HOME}/data',
      name: 'test',
    };
    const result = substConfigObject(obj);
    expect(result.path).toBe(`${homedir()}/data`);
    expect(result.name).toBe('test');
  });

  it('substitutes recursively in nested objects', () => {
    const obj = {
      nested: {
        user: '${USER}',
      },
    };
    const result = substConfigObject(obj);
    expect((result.nested as Record<string, unknown>).user).toBe(userInfo().username);
  });

  it('substitutes strings in arrays', () => {
    const obj = {
      items: ['${HOME}/a', '${HOME}/b'],
    };
    const result = substConfigObject(obj);
    expect(result.items).toEqual([`${homedir()}/a`, `${homedir()}/b`]);
  });

  it('substitutes in nested arrays of objects', () => {
    const obj = {
      items: [{ path: '${HOME}/x' }, { path: '${HOME}/y' }],
    };
    const result = substConfigObject(obj) as { items: Array<Record<string, string>> };
    expect(result.items[0]!.path).toBe(`${homedir()}/x`);
    expect(result.items[1]!.path).toBe(`${homedir()}/y`);
  });

  it('passes context through', () => {
    const obj = { root: '${PROJECT_ROOT}' };
    const result = substConfigObject(obj, { projectRoot: '/custom' });
    expect(result.root).toBe('/custom');
  });

  it('preserves non-string values', () => {
    const obj = { num: 42, bool: true, nul: null };
    const result = substConfigObject(obj);
    expect(result.num).toBe(42);
    expect(result.bool).toBe(true);
    expect(result.nul).toBeNull();
  });
});
