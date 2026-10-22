import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const source = new URL('ui/today/', root);
const output = new URL('build/ui/', root);
const SCRIPT_TAG = '<script type="module" src="./main.ts"></script>';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('main.ts', source))],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
});

const script = bundle.outputFiles[0]?.text;
if (!script) throw new Error('esbuild produced no output for the today view');

const template = await readFile(new URL('index.html', source), 'utf8');
if (!template.includes(SCRIPT_TAG)) throw new Error('The today view template has no script tag');

const html = template.replace(
  SCRIPT_TAG,
  () => `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`,
);

await mkdir(output, { recursive: true });
await writeFile(new URL('today.html', output), html);
process.stdout.write(`Built build/ui/today.html (${String(Math.round(html.length / 1024))} KB)\n`);
