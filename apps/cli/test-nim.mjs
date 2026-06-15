import { z } from 'zod';
import { readFileTool, writeFileTool, bashTool, globTool, grepTool, webFetchTool, webSearchTool } from '@sentinel/tools';

function zodToJsonSchema(schema) {
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties = {};
    const required = [];
    for (const [key, val] of Object.entries(shape)) {
      if (val instanceof z.ZodType) {
        properties[key] = zodToJsonSchema(val);
        if (!val.isOptional()) required.push(key);
      }
    }
    return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) return { type: 'array', items: zodToJsonSchema(schema._def.type) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema._def.values };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  return { type: 'string' };
}

const tools = [readFileTool, writeFileTool, bashTool, globTool, grepTool, webFetchTool, webSearchTool].filter(Boolean);
const body = {
  model: 'meta/llama-3.1-70b-instruct',
  messages: [{ role: 'system', content: 'You are Sentinel.' }, { role: 'user', content: 'say hello in one word' }],
  stream: true,
  tools: tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.inputSchema),
    },
  })),
};
console.log('First tool params:', JSON.stringify(body.tools[0].function.parameters, null, 2));
console.log('Total body length:', JSON.stringify(body).length, 'bytes');

const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.NVIDIA_API_KEY },
  body: JSON.stringify(body),
});
const text = await response.text();
console.log('Status:', response.status);
console.log('Response:', text.slice(0, 800));
