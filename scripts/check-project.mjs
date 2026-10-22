import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full); else files.push(full);
  }
}
walk(root);
const errors = [];
const verify = (file, spec) => {
  if (!spec.startsWith('.') || spec.includes('${')) return;
  const full = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) errors.push(`${path.relative(root,file)} -> ${spec}`);
};
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.js') || file.endsWith('.mjs')) {
    for (const match of text.matchAll(/(?:import\s+(?:[^;]*?\sfrom\s*)?|export\s+[^;]*?\sfrom\s*)["']([^"']+)["']/g)) verify(file, match[1]);
  }
  if (file.endsWith('.html')) for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) verify(file, match[1]);
  if (file.endsWith('.css')) for (const match of text.matchAll(/url\(["']?([^\)"']+)["']?\)/g)) verify(file, match[1]);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('All local module imports and assets resolve within this standalone repository.');
