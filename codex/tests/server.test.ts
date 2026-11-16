import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const html = '<!doctype html><html><body>Blockcraft server fixture<script type="module" src="/assets/game-test.js"></script></body></html>\n';
const javascript = 'export const fixture = 42;\n';
type Response = { status: number; headers: Record<string, string | string[] | undefined>; body: string };
let folder = '', port = 0, child: ChildProcess | undefined;
let diagnostics = '';

function http(path: string, method = 'GET'): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.setTimeout(4000, () => req.destroy(new Error('Local server request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

describe('production HTTP server', () => {
  before(async () => {
    // A temporary built-site fixture keeps this suite independent of npm run
    // build and prevents interference with a user's real dist or saved worlds.
    folder = await mkdtemp(join(tmpdir(), 'blockcraft-server-test-'));
    await mkdir(join(folder, 'scripts'));
    await mkdir(join(folder, 'dist', 'assets'), { recursive: true });
    await copyFile(fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url)), join(folder, 'scripts', 'serve.mjs'));
    await writeFile(join(folder, 'dist', 'index.html'), html);
    await writeFile(join(folder, 'dist', 'assets', 'game-test.js'), javascript);
    await writeFile(join(folder, 'private.txt'), 'THIS FILE MUST NEVER BE SERVED');

    // Import the actual unmodified server in an isolated process. Only its
    // socket binding is intercepted so the OS chooses an unused test port.
    // Production keeps 127.0.0.1:5173; no source or global process state changes.
    const bootstrap = `
      import { Server } from 'node:net';
      const listen = Server.prototype.listen;
      Server.prototype.listen = function(...args) {
        if (args[0] === 5173) {
          args[0] = 0;
          this.once('listening', () => process.send({ port: this.address().port }));
          process.on('message', message => {
            if (message === 'stop') this.close(() => process.exit(0));
          });
        }
        return listen.apply(this, args);
      };
      await import(process.argv[1]);
    `;
    child = spawn(process.execPath, ['--input-type=module', '--eval', bootstrap, pathToFileURL(join(folder, 'scripts', 'serve.mjs')).href], {
      cwd: folder, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    });
    child.stdout!.on('data', data => { diagnostics += data.toString(); });
    child.stderr!.on('data', data => { diagnostics += data.toString(); });
    await new Promise<void>((ready, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out.\n${diagnostics}`)), 7000);
      child!.once('error', error => { clearTimeout(timer); reject(error); });
      child!.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited before the tests (${code}).\n${diagnostics}`)); });
      child!.once('message', message => {
        clearTimeout(timer);
        const value = message as { port?: number };
        if (!Number.isInteger(value.port) || value.port! <= 0) reject(new Error('Server returned an invalid test port.'));
        else { port = value.port!; ready(); }
      });
    });
  }, { timeout: 10000 });

  after(async () => {
    if (child && child.exitCode === null && !child.killed) {
      await new Promise<void>(done => {
        const timer = setTimeout(() => child?.kill(), 2000);
        child!.once('exit', () => { clearTimeout(timer); done(); });
        try { if (child!.connected) child!.send('stop'); else child!.kill(); }
        catch { child!.kill(); }
      });
    }
    if (folder) {
      // Verify the generated absolute target before recursively removing the
      // test fixture, including when this suite runs on Windows.
      const target = resolve(folder);
      assert.equal(dirname(target), resolve(tmpdir()));
      assert.ok(target.includes('blockcraft-server-test-'));
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('serves the built index as HTML', async () => {
    const result = await http('/');
    assert.equal(result.status, 200);
    assert.equal(result.body, html);
    assert.match(String(result.headers['content-type']), /^text\/html; charset=utf-8$/);
  });

  it('serves JavaScript assets with an executable JavaScript MIME type', async () => {
    const result = await http('/assets/game-test.js');
    assert.equal(result.status, 200);
    assert.equal(result.body, javascript);
    assert.match(String(result.headers['content-type']), /^text\/javascript; charset=utf-8$/);
  });

  it('answers HEAD with the file length and no response body', async () => {
    const result = await http('/', 'HEAD');
    assert.equal(result.status, 200);
    assert.equal(Number(result.headers['content-length']), Buffer.byteLength(html));
    assert.equal(result.body, '');
  });

  it('returns 404 for a missing asset', async () => {
    assert.equal((await http('/does-not-exist.js')).status, 404);
  });

  it('blocks encoded parent-directory traversal', async () => {
    const result = await http('/%2e%2e%2fprivate.txt');
    assert.equal(result.status, 403);
    assert.doesNotMatch(result.body, /THIS FILE MUST NEVER BE SERVED/);
  });

  it('blocks traversal using encoded Windows path separators', async () => {
    const result = await http('/%2e%2e%5cprivate.txt');
    assert.equal(result.status, 403);
    assert.doesNotMatch(result.body, /THIS FILE MUST NEVER BE SERVED/);
  });

  it('rejects an encoded null byte', async () => {
    assert.equal((await http('/%00')).status, 400);
  });

  it('rejects invalid percent encoding', async () => {
    assert.equal((await http('/%zz')).status, 400);
  });

  it('does not expose the source server from outside dist', async () => {
    const result = await http('/scripts/serve.mjs');
    assert.equal(result.status, 404);
    assert.doesNotMatch(result.body, /createServer/);
  });

  it('rejects POST and identifies the supported methods', async () => {
    const result = await http('/', 'POST');
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'GET, HEAD');
  });
});
