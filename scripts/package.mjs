import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) throw new Error('Invalid release manifest.');
if (manifest.background || JSON.stringify(manifest.permissions) !== JSON.stringify(['storage']) || manifest.host_permissions?.length) {
  throw new Error('Unexpected background process or extra permissions. Review the privacy contract before packaging.');
}
if (manifest.action?.default_popup !== 'popup.html') throw new Error('Missing settings popup.');
if (JSON.stringify(manifest.content_scripts[0].matches) !== JSON.stringify(['https://www.linkedin.com/*'])) {
  throw new Error('Unexpected host access.');
}
const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative('dist', path).split(sep).join('/')] = [await readFile(path), { mtime: new Date('2026-01-01T00:00:00Z') }];
  }
}
await collect('dist');
const expected = ['content.js', 'icons/128.png', 'icons/16.png', 'icons/48.png', 'manifest.json', 'popup.css', 'popup.html', 'popup.js'];
if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(expected)) throw new Error('Unexpected extension files.');
const zip = zipSync(files, { level: 9 });
const unpacked = unzipSync(zip);
for (const name of expected) {
  if (!Buffer.from(unpacked[name]).equals(files[name][0])) throw new Error(`Archive mismatch: ${name}`);
}
await mkdir('artifacts', { recursive: true });
const output = `artifacts/pastestack-${manifest.version}.zip`;
await writeFile(output, zip);
console.log(`${output} (${zip.length.toLocaleString()} bytes; ${expected.length} files)`);
console.log(`SHA-256: ${createHash('sha256').update(zip).digest('hex')}`);
