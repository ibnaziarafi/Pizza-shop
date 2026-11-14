import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
const assets = {};
for (const entry of await readdir('public', { recursive:true, withFileTypes:true })) {
  if (!entry.isFile() || !mime[extname(entry.name)]) continue;
  const path = entry.parentPath + '/' + entry.name;
  assets[path.slice('public'.length)] = [mime[extname(path)], (await readFile(path)).toString('base64')];
}
await mkdir('dist/server', {recursive:true});
await mkdir('dist/.openai/drizzle', {recursive:true});
await cp('menu.mjs','dist/server/menu.mjs');
await cp('migrations','dist/.openai/drizzle',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
const worker = (await readFile('worker.mjs','utf8')).replace('export default { fetch: handleRequest };','');
await writeFile('dist/server/index.js', worker + `
const staticAssets = ${JSON.stringify(assets)};
const aliases = { '/': '/index.html', '/staff': '/staff.html' };
const serveAsset = async request => {
  const path = new URL(request.url).pathname;
  const asset = Object.hasOwn(staticAssets, aliases[path] ?? path) ? staticAssets[aliases[path] ?? path] : null;
  if (!asset) return new Response('Not found', {status:404});
  const [type, base64] = asset;
  const bytes = Uint8Array.fromBase64(base64);
  return new Response(request.method === 'HEAD' ? null : bytes, {headers:{'content-type':type,
    'cache-control':type.startsWith('image/') ? 'public,max-age=3600' : 'no-cache'}});
};
export default {fetch(request, env) {
  return handleRequest(request, { DB:env.DB, STAFF_PIN:env.STAFF_PIN, SESSION_SECRET:env.SESSION_SECRET, ASSETS:{fetch:serveAsset}});
}};
`);
