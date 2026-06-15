import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Workspace packages to mark as external (built separately via pnpm) */
const WORKSPACE_EXTERNALS = [
  '@sentinel/core',
  '@sentinel/providers',
  '@sentinel/tools',
  '@sentinel/sdk',
  '@sentinel/tui',
  '@sentinel/server',
  '@sentinel/mcp',
  '@sentinel/shared',
];

const isProd = process.env.NODE_ENV === 'production';

await esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.resolve(__dirname, 'dist/index.js'),
  banner: {
    js: `#!/usr/bin/env node\n// @sentinel/cli v${process.env.npm_package_version ?? '0.1.0'}`,
  },
  external: [
    ...WORKSPACE_EXTERNALS,
    'react-devtools-core',
    // Node.js built-ins are auto-external with platform: 'node'
  ],
  minify: isProd,
  sourcemap: isProd ? 'external' : false,
  sourcesContent: !isProd,
  treeShaking: true,
  keepNames: false,
  legalComments: 'none',
});
