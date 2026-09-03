import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const buildContext = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  platform: 'node',
  target: 'node16',
  sourcemap: !production,
  sourcesContent: false,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'info'
});

if (watch) {
  await buildContext.watch();
} else {
  await buildContext.rebuild();
  await buildContext.dispose();
}
