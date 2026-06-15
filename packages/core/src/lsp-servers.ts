import path from 'node:path';

export interface LSPServerDef {
  name: string;
  extensions: string[];
  command: string[];
  requirements?: string[];
  autoInstall?: boolean;
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  disabled?: boolean;
}

export const builtinLSPServers: LSPServerDef[] = [
  {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    command: ['typescript-language-server', '--stdio'],
    requirements: ['typescript'],
    autoInstall: true,
    initialization: {
      hostInfo: 'sentinel',
    },
  },
  {
    name: 'deno',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    command: ['deno', 'lsp'],
    requirements: ['deno'],
  },
  {
    name: 'pyright',
    extensions: ['.py', '.pyi'],
    command: ['pyright-langserver', '--stdio'],
    requirements: ['pyright'],
    autoInstall: true,
  },
  {
    name: 'gopls',
    extensions: ['.go'],
    command: ['gopls'],
    requirements: ['go'],
  },
  {
    name: 'rust-analyzer',
    extensions: ['.rs'],
    command: ['rust-analyzer'],
    requirements: ['rust-analyzer'],
    initialization: {
      cargo: { allFeatures: true },
    },
  },
  {
    name: 'bash-language-server',
    extensions: ['.sh', '.bash', '.zsh', '.ksh'],
    command: ['bash-language-server', 'start'],
    autoInstall: true,
  },
  {
    name: 'astro',
    extensions: ['.astro'],
    command: ['astro-ls', '--stdio'],
    autoInstall: true,
  },
  {
    name: 'clangd',
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
    command: ['clangd'],
    requirements: ['clangd'],
  },
  {
    name: 'csharp',
    extensions: ['.cs', '.csx'],
    command: ['csharp-ls'],
    requirements: ['dotnet'],
    autoInstall: true,
  },
  {
    name: 'clojure-lsp',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    command: ['clojure-lsp'],
    requirements: ['clojure-lsp'],
  },
  {
    name: 'dart',
    extensions: ['.dart'],
    command: ['dart', 'language-server'],
    requirements: ['dart'],
  },
  {
    name: 'elixir-ls',
    extensions: ['.ex', '.exs'],
    command: ['elixir-ls'],
    requirements: ['elixir'],
  },
  {
    name: 'eslint',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    command: ['vscode-eslint-language-server', '--stdio'],
    requirements: ['eslint'],
    autoInstall: true,
  },
  {
    name: 'fsharp',
    extensions: ['.fs', '.fsi', '.fsx'],
    command: ['dotnet', 'fsautocomplete'],
    requirements: ['dotnet'],
  },
  {
    name: 'gleam',
    extensions: ['.gleam'],
    command: ['gleam', 'lsp'],
    requirements: ['gleam'],
  },
  {
    name: 'hls',
    extensions: ['.hs', '.lhs'],
    command: ['haskell-language-server-wrapper'],
    requirements: ['haskell-language-server-wrapper'],
  },
  {
    name: 'jdtls',
    extensions: ['.java'],
    command: ['jdtls'],
    requirements: ['java'],
  },
  {
    name: 'julials',
    extensions: ['.jl'],
    command: ['julia'],
    requirements: ['julia'],
  },
  {
    name: 'kotlin-ls',
    extensions: ['.kt', '.kts'],
    command: ['kotlin-language-server'],
    autoInstall: true,
  },
  {
    name: 'lua-ls',
    extensions: ['.lua'],
    command: ['lua-language-server'],
    autoInstall: true,
  },
  {
    name: 'nixd',
    extensions: ['.nix'],
    command: ['nixd'],
    requirements: ['nixd'],
  },
  {
    name: 'ocaml-lsp',
    extensions: ['.ml', '.mli'],
    command: ['ocamllsp'],
    requirements: ['ocamllsp'],
  },
  {
    name: 'php-intelephense',
    extensions: ['.php'],
    command: ['intelephense', '--stdio'],
    autoInstall: true,
  },
  {
    name: 'prisma',
    extensions: ['.prisma'],
    command: ['prisma-language-server'],
    requirements: ['prisma'],
    autoInstall: true,
  },
  {
    name: 'razor',
    extensions: ['.razor', '.cshtml'],
    command: ['razor-language-server'],
    requirements: ['dotnet'],
  },
  {
    name: 'ruby-lsp',
    extensions: ['.rb', '.rake', '.gemspec'],
    command: ['ruby-lsp'],
    requirements: ['ruby'],
  },
  {
    name: 'sourcekit-lsp',
    extensions: ['.swift', '.m', '.mm'],
    command: ['sourcekit-lsp'],
    requirements: ['swift'],
  },
  {
    name: 'svelte',
    extensions: ['.svelte'],
    command: ['svelte-language-server', '--stdio'],
    autoInstall: true,
  },
  {
    name: 'terraform',
    extensions: ['.tf', '.tfvars'],
    command: ['terraform-ls', 'serve'],
    autoInstall: true,
  },
  {
    name: 'tinymist',
    extensions: ['.typ', '.typc'],
    command: ['tinymist', 'lsp'],
    autoInstall: true,
  },
  {
    name: 'vue',
    extensions: ['.vue'],
    command: ['vue-language-server', '--stdio'],
    autoInstall: true,
  },
  {
    name: 'oxlint',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'],
    command: ['oxlint', '--lsp'],
    requirements: ['oxlint'],
  },
  {
    name: 'yaml-ls',
    extensions: ['.yaml', '.yml'],
    command: ['yaml-language-server', '--stdio'],
    autoInstall: true,
  },
  {
    name: 'zls',
    extensions: ['.zig', '.zon'],
    command: ['zls'],
    requirements: ['zig'],
  },
];

export function getServerForFile(filePath: string, servers: LSPServerDef[]): LSPServerDef | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return undefined;
  return servers.find(s => !s.disabled && s.extensions.includes(ext));
}

export function findServerByName(name: string, servers: LSPServerDef[]): LSPServerDef | undefined {
  return servers.find(s => s.name === name);
}
