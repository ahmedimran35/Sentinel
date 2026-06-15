export interface FormatterDef {
  name: string;
  extensions: string[];
  command: string[];
  requirements?: string[];
  configFiles?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export const builtinFormatters: FormatterDef[] = [
  {
    name: 'air',
    extensions: ['.R'],
    command: ['air', '$FILE'],
    requirements: ['air'],
  },
  {
    name: 'biome',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.md', '.json', '.yaml'],
    command: ['biome', 'format', '--write', '$FILE'],
    configFiles: ['biome.json', 'biome.jsonc'],
  },
  {
    name: 'cargofmt',
    extensions: ['.rs'],
    command: ['cargo', 'fmt', '--', '$FILE'],
    requirements: ['cargo'],
  },
  {
    name: 'clang-format',
    extensions: ['.c', '.cpp', '.h', '.hpp', '.ino'],
    command: ['clang-format', '-i', '$FILE'],
    configFiles: ['.clang-format'],
  },
  {
    name: 'cljfmt',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    command: ['cljfmt', 'fix', '$FILE'],
    requirements: ['cljfmt'],
  },
  {
    name: 'dart',
    extensions: ['.dart'],
    command: ['dart', 'format', '$FILE'],
    requirements: ['dart'],
  },
  {
    name: 'dfmt',
    extensions: ['.d'],
    command: ['dfmt', '--inplace', '$FILE'],
    requirements: ['dfmt'],
  },
  {
    name: 'gleam',
    extensions: ['.gleam'],
    command: ['gleam', 'format', '$FILE'],
    requirements: ['gleam'],
  },
  {
    name: 'gofmt',
    extensions: ['.go'],
    command: ['gofmt', '-w', '$FILE'],
    requirements: ['gofmt'],
  },
  {
    name: 'htmlbeautifier',
    extensions: ['.erb', '.html.erb'],
    command: ['htmlbeautifier', '$FILE'],
    requirements: ['htmlbeautifier'],
  },
  {
    name: 'ktlint',
    extensions: ['.kt', '.kts'],
    command: ['ktlint', '-F', '$FILE'],
    requirements: ['ktlint'],
  },
  {
    name: 'mix',
    extensions: ['.ex', '.exs', '.eex', '.heex'],
    command: ['mix', 'format', '$FILE'],
    requirements: ['mix'],
  },
  {
    name: 'nixfmt',
    extensions: ['.nix'],
    command: ['nixfmt', '$FILE'],
    requirements: ['nixfmt'],
  },
  {
    name: 'ocamlformat',
    extensions: ['.ml', '.mli'],
    command: ['ocamlformat', '--inplace', '$FILE'],
    configFiles: ['.ocamlformat'],
  },
  {
    name: 'ormolu',
    extensions: ['.hs'],
    command: ['ormolu', '--mode', 'inplace', '$FILE'],
    requirements: ['ormolu'],
  },
  {
    name: 'oxfmt',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    command: ['oxfmt', '$FILE'],
    configFiles: ['package.json'],
  },
  {
    name: 'pint',
    extensions: ['.php'],
    command: ['./vendor/bin/pint', '$FILE'],
    requirements: ['pint'],
  },
  {
    name: 'prettier',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.md', '.json', '.yaml'],
    command: ['npx', 'prettier', '--write', '$FILE'],
    configFiles: ['package.json'],
  },
  {
    name: 'rubocop',
    extensions: ['.rb', '.rake', '.gemspec'],
    command: ['rubocop', '-a', '$FILE'],
    requirements: ['rubocop'],
  },
  {
    name: 'ruff',
    extensions: ['.py', '.pyi'],
    command: ['ruff', 'format', '$FILE'],
    requirements: ['ruff'],
  },
  {
    name: 'rustfmt',
    extensions: ['.rs'],
    command: ['rustfmt', '$FILE'],
    requirements: ['rustfmt'],
  },
  {
    name: 'shfmt',
    extensions: ['.sh', '.bash'],
    command: ['shfmt', '-w', '$FILE'],
    requirements: ['shfmt'],
  },
  {
    name: 'standardrb',
    extensions: ['.rb', '.rake', '.gemspec'],
    command: ['standardrb', '--fix', '$FILE'],
    requirements: ['standardrb'],
  },
  {
    name: 'terraform',
    extensions: ['.tf', '.tfvars'],
    command: ['terraform', 'fmt', '$FILE'],
    requirements: ['terraform'],
  },
  {
    name: 'uv',
    extensions: ['.py', '.pyi'],
    command: ['uv', 'fmt', '$FILE'],
    requirements: ['uv'],
  },
  {
    name: 'zig',
    extensions: ['.zig', '.zon'],
    command: ['zig', 'fmt', '$FILE'],
    requirements: ['zig'],
  },
];
