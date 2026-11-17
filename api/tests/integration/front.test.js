import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';
import { servirFront } from '../../src/middlewares/front.js';

// Um front "construído" de mentira, como o web/dist: index.html, um arquivo com hash em assets/ e o manifesto.
const pasta = mkdtempSync(path.join(tmpdir(), 'emmoo-front-'));
mkdirSync(path.join(pasta, 'assets'));
writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><title>EMMOO</title><div id="root"></div>');
writeFileSync(path.join(pasta, 'assets', 'index-abc123.js'), `console.log('${'emmoo '.repeat(400)}');`);
writeFileSync(path.join(pasta, 'manifest.webmanifest'), '{"name":"EMMOO"}');
writeFileSync(path.join(pasta, 'icon-192.png'), 'png');

let servidores = [];
async function subir(opcoes = {}) {
  const env = loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'memory', JWT_SECRET: 'segredo-de-teste' });
  const { auth, escolas, servicosDaEscola, tokenService } = await createContainer(env);
  const app = createApp({ auth, escolas, servicosDaEscola, tokenService, logger: { error() {} }, ...opcoes });
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  servidores.push(servidor);
  return `http://127.0.0.1:${servidor.address().port}`;
}
const pagina = { headers: { Accept: 'text/html,application/xhtml+xml' } };

after(async () => {
  await Promise.all(servidores.map((servidor) => new Promise((resolve) => servidor.close(resolve))));
  servidores = [];
  rmSync(pasta, { recursive: true, force: true });
});

describe('produção num serviço só: a API entrega o front construído', () => {
  let base;
  before(async () => {
    base = await subir({ pastaDoFront: pasta });
  });

  it('a página inicial e as rotas do React recebem o index.html, sem cache', async () => {
    for (const rota of ['/', '/agenda', '/alunos/3', '/login?escola=emmoo']) {
      const resposta = await fetch(`${base}${rota}`, pagina);
      assert.equal(resposta.status, 200, rota);
      assert.match(resposta.headers.get('content-type'), /text\/html/);
      assert.equal(resposta.headers.get('cache-control'), 'no-cache');
      assert.match(await resposta.text(), /<div id="root">/);
    }
  });

  it('arquivos de assets/ (com hash no nome) ficam em cache por um ano e vão comprimidos', async () => {
    const resposta = await fetch(`${base}/assets/index-abc123.js`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(resposta.headers.get('content-encoding'), 'gzip');
    assert.match(await resposta.text(), /emmoo/); // o fetch descomprime
  });

  it('manifesto sem cache, com o tipo certo; ícones com cache de um dia', async () => {
    const manifesto = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifesto.headers.get('cache-control'), 'no-cache');
    assert.match(manifesto.headers.get('content-type'), /application\/manifest\+json/);
    assert.equal((await fetch(`${base}/icon-192.png`)).headers.get('cache-control'), 'public, max-age=86400');
  });

  it('a API continua respondendo, e o que não existe recebe 404 em JSON (não a página)', async () => {
    assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
    for (const rota of ['/api/nada', '/api', '/assets/versao-antiga.js', '/favicon.ico']) {
      const resposta = await fetch(`${base}${rota}`, pagina);
      assert.equal(resposta.status, 404, rota);
      assert.equal((await resposta.json()).error.code, 'NOT_FOUND', rota);
    }
  });

  it('pedido que não aceita HTML (ex.: um fetch de JSON) também não recebe a página', async () => {
    const resposta = await fetch(`${base}/agenda`, { headers: { Accept: 'application/json' } });
    assert.equal(resposta.status, 404);
  });

  it('sem HTTPS no endereço, a política de segurança não manda o navegador trocar http por https', async () => {
    const csp = (await fetch(`${base}/`, pagina)).headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  });
});

describe('cabeçalhos de segurança com o site em HTTPS', () => {
  it('com APP_URL em https, a política pede ao navegador que use sempre https', async () => {
    const base = await subir({ pastaDoFront: pasta, appUrl: 'https://emmoo.escola.com.br' });
    assert.match((await fetch(`${base}/`, pagina)).headers.get('content-security-policy'), /upgrade-insecure-requests/);
  });

  it('sem pastaDoFront (desenvolvimento), só a API: as rotas do front são 404', async () => {
    const base = await subir();
    assert.equal((await fetch(`${base}/agenda`, pagina)).status, 404);
  });

  it('FRONT_DIR sem o front construído: falha ao iniciar, dizendo o que fazer', () => {
    assert.throws(() => servirFront(path.join(pasta, 'nao-existe')), /Na pasta "web", rode: npm run build/);
  });
});
