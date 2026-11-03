import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(nativeRoot, '..');
const output = join(nativeRoot, 'www');

await mkdir(join(output, 'assets'), { recursive: true });
const files = [
  'review.css', 'meal-tools.css', 'mizo.css', 'identity.css',
  'meal-tools.js', 'mizo.js', 'mizo-audio.js', 'puppy.js',
  'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'manifest.webmanifest',
  'privacy.html',
];
await Promise.all(files.map(name => cp(join(webRoot, name), join(output, name))));
await cp(join(webRoot, 'assets'), join(output, 'assets'), { recursive: true });
await cp(join(nativeRoot, 'node_modules/chart.js/dist/chart.umd.min.js'), join(output, 'chart.umd.min.js'));
await cp(join(nativeRoot, 'node_modules/html5-qrcode/html5-qrcode.min.js'), join(output, 'html5-qrcode.min.js'));

await build({
  entryPoints: [join(nativeRoot, 'src/native-bridge.js')],
  outfile: join(output, 'native-bridge.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: true,
  target: ['es2022'],
});

let html = await readFile(join(webRoot, 'index.html'), 'utf8');
html = html.replace('https://cdn.jsdelivr.net/npm/chart.js', './chart.umd.min.js');
html = html.replace('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', './html5-qrcode.min.js');
if (!html.includes('<script>\n')) throw new Error('Could not locate app bootstrap script');
html = html.replace('<script>\n', '<script src="./native-bridge.js"></script>\n<script>\n');
await writeFile(join(output, 'index.html'), html);
console.log(`Built native web assets in ${output}`);
