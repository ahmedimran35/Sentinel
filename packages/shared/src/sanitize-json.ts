export function sanitizeJson(raw: string): unknown {
  return JSON.parse(raw, (_key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const sanitized: Record<string, unknown> = {};
      for (const k of Object.keys(value)) {
        if (k !== '__proto__' && k !== 'constructor') {
          sanitized[k] = (value as Record<string, unknown>)[k];
        }
      }
      return sanitized;
    }
    return value;
  });
}
