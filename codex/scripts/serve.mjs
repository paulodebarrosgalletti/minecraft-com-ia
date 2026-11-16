import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

// This server intentionally keeps the same origin as the development server:
// IndexedDB worlds belong to http://127.0.0.1:5173 in the current browser profile.
const HOST = '127.0.0.1';
const PORT = 5173;
const ADDRESS = `http://${HOST}:${PORT}`;
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let root;
try {
  root = await realpath(resolve(project, 'dist'));
  if (!(await stat(resolve(root, 'index.html'))).isFile()) throw new Error('index.html ausente');
} catch {
  console.error('A versão pronta não foi encontrada. Execute npm.cmd run build na pasta do projeto.');
  process.exit(1);
}

const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'],
  ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.mp3', 'audio/mpeg'],
  ['.wasm', 'application/wasm'],
]);
const withinRoot = path => path === root || path.startsWith(root + sep);
const plain = (response, status, message, head = false) => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  response.end(head ? undefined : message);
};

const server = createServer(async (request, response) => {
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head) {
    response.setHeader('Allow', 'GET, HEAD');
    plain(response, 405, 'Método não permitido.');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', ADDRESS).pathname).replaceAll('\\', '/');
  } catch {
    plain(response, 400, 'Endereço inválido.', head);
    return;
  }
  if (pathname.includes('\0')) {
    plain(response, 400, 'Endereço inválido.', head);
    return;
  }
  const candidate = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  if (!withinRoot(candidate)) {
    plain(response, 403, 'Acesso não permitido.', head);
    return;
  }
  try {
    // Checking the real path also prevents a symlink in dist from exposing files
    // outside the built game directory.
    const path = await realpath(candidate);
    if (!withinRoot(path)) {
      plain(response, 403, 'Acesso não permitido.', head);
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      plain(response, 404, 'Arquivo não encontrado.', head);
      return;
    }
    response.writeHead(200, {
      'Content-Type': types.get(extname(path).toLowerCase()) ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': extname(path) === '.html' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (head) { response.end(); return; }
    const file = createReadStream(path);
    file.on('error', () => response.destroy());
    response.on('close', () => file.destroy());
    file.pipe(response);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') plain(response, 404, 'Arquivo não encontrado.', head);
    else {
      console.error('Não foi possível ler um arquivo do jogo:', error?.message ?? error);
      plain(response, 500, 'Falha ao ler o arquivo.', head);
    }
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está em uso. Se o jogo já estiver aberto, acesse ${ADDRESS}.`);
    console.error('Encerre a outra instância antes de iniciar este servidor. A porta não será alterada.');
  } else console.error('Falha ao iniciar o servidor:', error.message);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Blockcraft está pronto em ${ADDRESS}`);
  console.log('Servidor restrito a este computador. Ctrl+C encerra.');
  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', ADDRESS] : [ADDRESS];
    execFile(command, args, { windowsHide: true }, error => {
      if (error) console.log(`Abra o navegador manualmente: ${ADDRESS}`);
    });
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
