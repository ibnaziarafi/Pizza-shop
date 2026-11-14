import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest } from './worker.mjs';

const projectDir = fileURLToPath(new URL('.', import.meta.url));
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function localDatabase(filePath) {
  const connection = new DatabaseSync(filePath);
  const prepare = (sql, values = []) => ({
    bind(...params) {
      return prepare(sql, params);
    },
    async first() {
      return connection.prepare(sql).get(...values) ?? null;
    },
    async all() {
      return { results: connection.prepare(sql).all(...values) };
    },
    async run() {
      return connection.prepare(sql).run(...values);
    },
  });
  return { prepare, connection };
}

async function serveAsset(request) {
  const url = new URL(request.url);
  const relativePath = decodeURIComponent(({'/':'/index.html','/staff':'/staff.html'})[url.pathname] ?? url.pathname);
  const assetsDir = resolve(projectDir, 'public');
  const filePath = resolve(assetsDir, `.${relativePath}`);
  if (!filePath.startsWith(`${assetsDir}${sep}`)) return new Response('Not found', { status: 404 });
  try {
    const data = await readFile(filePath);
    return new Response(data, { headers: { 'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

export async function createLocalServer({ port = 4173, databasePath = resolve(projectDir, 'data/local.sqlite'), pin = '2468' } = {}) {
  await mkdir(resolve(databasePath, '..'), { recursive: true });
  const { prepare, connection } = localDatabase(databasePath);
  connection.exec(await readFile(resolve(projectDir, 'migrations/0001_initial.sql'), 'utf8'));
  const env = { DB: { prepare }, ASSETS: { fetch: serveAsset }, STAFF_PIN: pin, SESSION_SECRET: 'local-preview-only-session-key' };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const method = incoming.method ?? 'GET';
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(`http://${incoming.headers.host ?? 'localhost'}${incoming.url ?? '/'}`, {
        method,
        headers: incoming.headers,
        ...(body && method !== 'GET' && method !== 'HEAD' ? { body } : {}),
      });
      const response = await handleRequest(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify({ error: 'The local preview could not complete this request.' }));
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  return {
    server,
    close() {
      return new Promise((resolveClose, reject) => {
        server.close((error) => {
          connection.close();
          if (error) reject(error);
          else resolveClose();
        });
      });
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const preview = await createLocalServer({ port, pin: process.env.STAFF_PIN ?? '2468' });
  console.log(`Mi Pizza local preview: http://127.0.0.1:${port}`);
  console.log(`Demo staff PIN: ${process.env.STAFF_PIN ? 'set in environment' : '2468'}`);
  const stop = () => preview.close().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
