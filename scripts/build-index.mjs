import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({ configFile: path.join(root, 'vite.html.config.mts') });
let javascript = await readFile(path.join(root, '.html-build/thonhub.js'), 'utf8');
const css = await readFile(path.join(root, '.html-build/thonhub.css'), 'utf8');
for (const [name, mime] of [['thonhub-logo.png', 'image/png'], ['orange-orbit.webp', 'image/webp']]) {
  const data = 'data:' + mime + ';base64,' + (await readFile(path.join(root, 'public', name))).toString('base64');
  javascript = javascript.replaceAll('/' + name, data);
}
const icon = 'data:image/svg+xml;base64,' + (await readFile(path.join(root, 'public/favicon.svg'))).toString('base64');
const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="description" content="Discover and join Edutantr workshops, webinars, hackathons and events. Learn, build and connect with Thon Hub."><title>Thon Hub | Powered by Edutantr</title><link rel="icon" href="' + icon + '"><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body><div id="root"></div><noscript>Please enable JavaScript to explore Thon Hub events.</noscript><script>' + javascript.replace(/<\/script/gi, '<\\/script') + '</script></body></html>\n';
await mkdir(path.join(root, 'public'), { recursive: true });
await writeFile(path.join(root, 'index.html'), html);
await writeFile(path.join(root, 'public/index.html'), html);
console.log('Generated index.html with the complete browser app, styles and embedded brand images.');
