import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Package and manifest versions must match.');
const options = {
  entryPoints: ['src/content.ts'],
  outfile: 'dist/content.js',
  bundle: true,
  minify: true,
  target: 'chrome120',
  format: 'iife',
  loader: { '.css': 'text' },
  legalComments: 'none',
  logLevel: 'info',
};
if (process.argv.includes('--watch')) {
  const session = await context(options);
  await session.watch();
  console.log('Watching source. Reload PasteStack in chrome://extensions after changes.');
} else {
  await build(options);
  const bytes = (await stat('dist/content.js')).size;
  if (bytes > 20 * 1024) throw new Error(`Content script is ${bytes} bytes; budget is 20 KiB.`);
  console.log(`PasteStack: ${bytes.toLocaleString()} bytes of JS, zero runtime dependencies.`);
}
