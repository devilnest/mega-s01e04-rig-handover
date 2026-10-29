import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const [url, output] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node scripts/export-preview.mjs <local digest URL> <output outside repo>');
const source = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) throw new Error('Export the running local rig.');
const project = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(output);
const inside = relative(project, destination);
if (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`)) throw new Error('Previews must stay outside the repository.');

let response;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    response = await fetch(source, { signal: AbortSignal.timeout(5000) });
    break;
  } catch (error) {
    if (attempt === 39) throw error;
    await setTimeout(250);
  }
}
if (!response?.ok) throw new Error(`Digest returned HTTP ${response?.status}`);
const html = await response.text();
if (!html.startsWith('<!doctype html>') || !html.includes('<table>') || !html.includes('class="marker"')) {
  throw new Error('Expected the full digest with its lane banner.');
}
if (/<script\b|<(?:link|iframe|img)\b/i.test(html)) throw new Error('The preview must be self-contained and script-free.');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, html, 'utf8');
console.log('Saved one self-contained HTML digest outside the repository.');
