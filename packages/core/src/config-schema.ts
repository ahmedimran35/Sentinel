import { z } from 'zod';

const ProviderOptionsSchema = z.object({
  timeout: z.number().positive().optional(),
  chunkTimeout: z.number().positive().optional(),
  setCacheKey: z.boolean().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  region: z.string().optional(),
  profile: z.string().optional(),
  endpoint: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const ProviderEntrySchema = z.object({
  options: ProviderOptionsSchema.optional(),
});

export const AgentConfigSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  mode: z.enum(['plan', 'build', 'auto', 'yolo']).optional(),
});

const ToolPermissionLevelSchema = z.enum(['allow', 'ask', 'deny']);

const PerToolPermissionSchema = z.object({
  tool: z.string().min(1),
  permission: ToolPermissionLevelSchema,
});

export const PermissionConfigSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  approveByDefault: z.boolean().optional(),
  perToolPermissions: z.array(PerToolPermissionSchema).optional(),
  defaultToolPermission: ToolPermissionLevelSchema.optional(),
});

export const FormatterEntryConfigSchema = z.object({
  extensions: z.array(z.string()),
  command: z.string(),
  args: z.array(z.string()),
});

export const LSPEntryConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  languages: z.array(z.string()),
});

export const MCPEntryConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  disabled: z.boolean().optional(),
});

const CustomToolEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  command: z.array(z.string()).min(1),
  environment: z.record(z.string()).optional(),
  timeout: z.number().int().positive().optional(),
});

export const SentinelConfigSchema = z.object({
  $schema: z.string().optional(),
  model: z.string().optional(),
  small_model: z.string().optional(),
  provider: z.record(ProviderEntrySchema).optional(),
  default_agent: z.string().optional(),
  agent: z.record(AgentConfigSchema).optional(),
  permission: PermissionConfigSchema.optional(),
  tools: z.record(z.boolean()).optional(),
  server: z.object({
    port: z.number().int().positive().optional(),
    hostname: z.string().optional(),
    mdns: z.boolean().optional(),
    mdnsDomain: z.string().optional(),
    cors: z.array(z.string()).optional(),
  }).optional(),
  shell: z.string().optional(),
  formatter: z.union([z.boolean(), z.record(FormatterEntryConfigSchema)]).optional(),
  lsp: z.union([z.boolean(), z.record(LSPEntryConfigSchema)]).optional(),
  mcp: z.record(MCPEntryConfigSchema).optional(),
  plugin: z.array(z.string()).optional(),
  instructions: z.array(z.string()).optional(),
  disabled_providers: z.array(z.string()).optional(),
  enabled_providers: z.array(z.string()).optional(),
  share: z.enum(['manual', 'auto', 'disabled']).optional(),
  compaction: z.object({
    auto: z.boolean().optional(),
    prune: z.boolean().optional(),
    reserved: z.number().int().nonnegative().optional(),
  }).optional(),
  snapshot: z.boolean().optional(),
  autoupdate: z.union([z.boolean(), z.literal('notify')]).optional(),
  watcher: z.object({
    ignore: z.array(z.string()).optional(),
  }).optional(),
  attachment: z.object({
    image: z.object({
      auto_resize: z.boolean().optional(),
      max_width: z.number().positive().optional(),
      max_height: z.number().positive().optional(),
      max_base64_bytes: z.number().positive().optional(),
    }).optional(),
  }).optional(),
  custom_tools: z.array(CustomToolEntrySchema).optional(),
  experimental: z.record(z.unknown()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;
export type FormatterEntryConfig = z.infer<typeof FormatterEntryConfigSchema>;
export type LSPEntryConfig = z.infer<typeof LSPEntryConfigSchema>;
export type MCPEntryConfig = z.infer<typeof MCPEntryConfigSchema>;
export type CustomToolEntry = z.infer<typeof CustomToolEntrySchema>;
export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
